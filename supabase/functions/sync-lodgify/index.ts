import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const lodgifyApiKey = Deno.env.get('LODGIFY_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!lodgifyApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Clés de configuration manquantes.")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fenêtre de recherche (-10 jours -> +30 jours)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const pastDays = 10
    const horizonDays = 30
    const startDate = new Date(today.getTime() - pastDays * 24 * 3600 * 1000)
    const endDate = new Date(today.getTime() + horizonDays * 24 * 3600 * 1000)
    endDate.setHours(23, 59, 59, 999)

    // 2. Appel API Lodgify (On récupère tout le passé et le futur)
    const lodgifyUrl = "https://api.lodgify.com/v2/reservations/bookings?size=200&includeExternal=true&trash=false&stayFilter=All"
    const response = await fetch(lodgifyUrl, {
      method: "GET",
      headers: { "X-ApiKey": lodgifyApiKey, "Accept": "application/json" }
    })

    if (!response.ok) throw new Error(`Erreur API Lodgify: ${response.status}`)

    const data = await response.json()
    const bookings = Array.isArray(data.items) ? data.items : []

    let reservationsToUpsert: any[] = []
    let cacheChambres: Record<string, string> = {}

    // 3. Préparation des Réservations
    for (const booking of bookings) {
      const lodgifyId = String(booking.id)
      const roomTypeId = booking.rooms?.[0]?.room_type_id ? String(booking.rooms[0].room_type_id) : null
      
      if (!lodgifyId || !roomTypeId || !booking.arrival || !booking.departure) continue;

      const arrivee = new Date(booking.arrival)
      const depart = new Date(booking.departure)
      if (arrivee > endDate || depart < startDate) continue;

      let chambreIdInterne = cacheChambres[roomTypeId]
      if (!chambreIdInterne) {
        const { data: chambreData } = await supabase
          .from('chambres')
          .select('id')
          .eq('lodgify_room_type_id', roomTypeId)
          .single()
        
        if (chambreData) {
          chambreIdInterne = chambreData.id
          cacheChambres[roomTypeId] = chambreIdInterne
        } else {
          continue;
        }
      }

      reservationsToUpsert.push({
        lodgify_id: lodgifyId,
        chambre_id: chambreIdInterne,
        nom_client: booking.guest?.name || "Client Inconnu",
        date_arrivee: arrivee.toISOString().split('T')[0],
        date_depart: depart.toISOString().split('T')[0],
        nb_occupants: booking.rooms?.[0]?.people || null,
        statut: booking.status
      })
    }

    // 4. ETAPE A : UPSERT des Réservations
    let reservationsInsereesOuMisesAJour: any[] = []
    if (reservationsToUpsert.length > 0) {
      const { data: upsertedData, error: upsertError } = await supabase
        .from('reservations')
        .upsert(reservationsToUpsert, { onConflict: 'lodgify_id' })
        // NOUVEAU : On récupère aussi options_json pour la génération des checklists
        .select('id, lodgify_id, chambre_id, date_arrivee, date_depart, statut, options_json') 
      
      if (upsertError) throw upsertError;
      reservationsInsereesOuMisesAJour = upsertedData || []
    }

    // NOUVEAU : Récupération des modèles de checklists en base
    const { data: modelesBase } = await supabase.from('checklist_modeles').select('*').eq('est_actif', true)
    const { data: optionsBase } = await supabase.from('checklist_options').select('*').eq('est_actif', true)
    const modeles = modelesBase || []
    const checklistOptions = optionsBase || []

    // 5. ETAPE B : Nettoyage et Création des Tâches
    let tachesAInserer: any[] = []
    let nouvellesTachesInserees: any[] = []

    if (reservationsInsereesOuMisesAJour.length > 0) {
      const resIds = reservationsInsereesOuMisesAJour.map(r => r.id)
      
      // 5.1 Nettoyage des vieilles tâches "A FAIRE"
      await supabase
        .from('taches')
        .delete()
        .in('reservation_id', resIds)
        .eq('statut', 'A FAIRE')

      // NOUVEAU : On regarde ce qu'il reste (ex: les tâches TERMINÉ) pour ne pas créer de doublons !
      const { data: tachesRestantes } = await supabase
        .from('taches')
        .select('date_prevue, type_tache, reservation_id')
        .in('reservation_id', resIds)
      
      const existantes = tachesRestantes || []

      // 5.2 Calcul des nouvelles Tâches
      for (const res of reservationsInsereesOuMisesAJour) {
        if (res.statut !== 'Booked') continue;
        const arr = new Date(res.date_arrivee)
        const dep = new Date(res.date_depart)

        const preparerTache = (dateTache: Date, type: string) => {
          const dateStr = dateTache.toISOString().split('T')[0]
          
          // VERIFICATION : Est-ce que cette tâche existe déjà en base ?
          const dejaFaite = existantes.find(t => 
            t.reservation_id === res.id && 
            t.date_prevue === dateStr && 
            t.type_tache === type
          )

          // On ne prépare l'insertion QUE si elle n'existe pas
          if (!dejaFaite) {
            tachesAInserer.push({
              date_prevue: dateStr,
              chambre_id: res.chambre_id,
              reservation_id: res.id,
              type_tache: type,
              commentaire: ""
            })
          }
        }

        preparerTache(arr, 'Arrivée')
        
        let dInter = new Date(arr.getTime())
        dInter.setDate(dInter.getDate() + 1)
        while (dInter.getTime() < dep.getTime()) {
          preparerTache(dInter, 'Intermédiaire')
          dInter.setDate(dInter.getDate() + 1)
        }
        
        preparerTache(dep, 'Départ')
      }

      // 5.3 Insertion Finale des Tâches
      if (tachesAInserer.length > 0) {
        const { data: insertedData, error: insertTachesError } = await supabase
          .from('taches')
          .insert(tachesAInserer)
          .select('id, reservation_id, type_tache') 
        
        if (insertTachesError) {
          console.error("Erreur insertion tâches :", insertTachesError.message)
        } else {
          nouvellesTachesInserees = insertedData || []
        }
      }
    }

    // 6. ETAPE C : Génération des Checklists (Sous-tâches)
    let sousTachesAInserer: any[] = []

    if (nouvellesTachesInserees.length > 0) {
      for (const tache of nouvellesTachesInserees) {
        
        // On retrouve la réservation liée pour lire ses options JSON
        const resaLiee = reservationsInsereesOuMisesAJour.find(r => r.id === tache.reservation_id)
        const optionsResa = resaLiee?.options_json || {}

        // A. Ajout des tâches standards pour ce type de tâche (Arrivée, Départ...)
        const standards = modeles.filter(m => m.type_tache === tache.type_tache)
        for (const std of standards) {
          sousTachesAInserer.push({
            tache_id: tache.id,
            libelle: std.libelle,
            ordre: std.ordre
          })
        }

        // B. Ajout des tâches conditionnelles si l'option est activée dans la résa
        const conditionnelles = checklistOptions.filter(o => o.type_tache === tache.type_tache)
        for (const cond of conditionnelles) {
          // Si le JSON contient {"Petit déjeuner": true}, on ajoute !
          if (optionsResa[cond.mot_cle] === true || optionsResa[cond.mot_cle] === "true") {
            sousTachesAInserer.push({
              tache_id: tache.id,
              libelle: cond.libelle,
              ordre: cond.ordre
            })
          }
        }
      }

      // Insertion en base de toutes les sous-tâches d'un coup (Batch Insert)
      if (sousTachesAInserer.length > 0) {
        const { error: itemsError } = await supabase
          .from('tache_items_execution')
          .insert(sousTachesAInserer)
        
        if (itemsError) console.error("Erreur insertion sous-tâches :", itemsError.message)
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Synchronisation v3 (avec Checklists) réussie", 
        tachesGenerees: nouvellesTachesInserees.length,
        itemsGeneres: sousTachesAInserer.length
      }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    console.error("Erreur fatale:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})