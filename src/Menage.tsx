import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

// --- TYPAGES ---
interface TacheItem {
  id: string;
  libelle: string;
  ordre: number;
  est_fait: boolean;
}
interface MinibarProduit {
  id: string;
  nom: string;
  prix: number;
}
interface MinibarConsommation {
  id: string;
  produit_id: string;
  quantite: number;
}

interface Tache {
  id: string;
  reservation_id: string;
  date_prevue: string;
  type_tache: string;
  statut: string;
  reservations: { nom_client: string };
  chambres: { nom: string };
  tache_items_execution: TacheItem[];
  minibar_consommations: MinibarConsommation[];
}

interface TacheRecurrente {
  id: string;
  libelle: string;
  frequence_jours: number;
  derniere_execution: string;
  chambre_id: string;
  chambres: { nom: string };
}

function Menage() {
  const navigate = useNavigate();
  // --- ÉTATS ---
  const [ongletActif, setOngletActif] = useState<"QUOTIDIEN" | "RECURRENTES">(
    "QUOTIDIEN",
  );

  const [taches, setTaches] = useState<Tache[]>([]);
  const [tachesRecurrentes, setTachesRecurrentes] = useState<TacheRecurrente[]>(
    [],
  );
  const [produits, setProduits] = useState<MinibarProduit[]>([]);
  const [chargement, setChargement] = useState(true);

  // État pour afficher les tâches du futur
  const [afficherProchaines, setAfficherProchaines] = useState(false);

  // États pour les fenêtres dépliantes
  const [tacheDepliee, setTacheDepliee] = useState<string | null>(null);
  const [chambreDepliee, setChambreDepliee] = useState<string | null>(null);

  const aujourdhui = new Date().toISOString().split("T")[0];

  // --- COULEURS CHARTE GRAPHIQUE ---
  const BLEU_CALIFORNIA = "#009CD8";
  const ORANGE_CALIFORNIA = "#E95219";

  // --- OUTIL FORMATAGE DATE ---
  const formaterDate = (dateString: string) => {
    const [annee, mois, jour] = dateString.split("-");
    return `${jour}/${mois}/${annee}`;
  };

  useEffect(() => {
    async function fetchData() {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const ilYa10Jours = pastDate.toISOString().split("T")[0];

      // On calcule une date dans le futur (ex: +15 jours) pour anticiper le ménage
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);
      const dans15Jours = futureDate.toISOString().split("T")[0];

      // La requête prend les tâches passées (si A FAIRE) ET les tâches futures (jusqu'à 15 jours)
      const { data: tachesData } = await supabase
        .from("taches")
        .select(
          `id, reservation_id, date_prevue, type_tache, statut, reservations ( nom_client ), chambres ( nom ), tache_items_execution ( id, libelle, ordre, est_fait ), minibar_consommations ( id, produit_id, quantite )`,
        )
        .or(
          `and(date_prevue.gte.${aujourdhui},date_prevue.lte.${dans15Jours}),and(date_prevue.gte.${ilYa10Jours},date_prevue.lt.${aujourdhui},statut.eq."A FAIRE")`,
        )
        .order("date_prevue", { ascending: true });

      const { data: produitsData } = await supabase
        .from("minibar_produits")
        .select("*")
        .eq("est_actif", true);

      const { data: recurrentesData } = await supabase
        .from("taches_recurrentes")
        .select(
          `id, libelle, frequence_jours, derniere_execution, chambre_id, chambres ( nom )`,
        )
        .eq("est_actif", true);

      if (tachesData) setTaches(tachesData as unknown as Tache[]);
      if (produitsData) setProduits(produitsData);
      if (recurrentesData)
        setTachesRecurrentes(recurrentesData as unknown as TacheRecurrente[]);

      setChargement(false);
    }
    fetchData();
  }, [aujourdhui]);

  // --- ACTIONS QUOTIDIENNES ---
  const marquerCommeTerminee = async (idTache: string) => {
    setTaches(
      taches.map((t) => (t.id === idTache ? { ...t, statut: "TERMINÉ" } : t)),
    );
    await supabase
      .from("taches")
      .update({ statut: "TERMINÉ" })
      .eq("id", idTache);
  };

  const toggleItem = async (
    tacheId: string,
    itemId: string,
    etatActuel: boolean,
  ) => {
    const nouvelEtat = !etatActuel;
    setTaches(
      taches.map((tache) =>
        tache.id === tacheId
          ? {
              ...tache,
              tache_items_execution: tache.tache_items_execution.map((item) =>
                item.id === itemId ? { ...item, est_fait: nouvelEtat } : item,
              ),
            }
          : tache,
      ),
    );
    await supabase
      .from("tache_items_execution")
      .update({
        est_fait: nouvelEtat,
        fait_a: nouvelEtat ? new Date().toISOString() : null,
      })
      .eq("id", itemId);
  };

  const modifierConso = async (
    tacheId: string,
    produitId: string,
    changement: number,
  ) => {
    const tache = taches.find((t) => t.id === tacheId);
    if (!tache) return;
    const consoActuelle = tache.minibar_consommations.find(
      (c) => c.produit_id === produitId,
    );
    const nouvelleQuantite =
      (consoActuelle ? consoActuelle.quantite : 0) + changement;
    if (nouvelleQuantite < 0) return;

    setTaches(
      taches.map((t) => {
        if (t.id === tacheId) {
          let nC = [...t.minibar_consommations];
          if (consoActuelle)
            nC = nC.map((c) =>
              c.produit_id === produitId
                ? { ...c, quantite: nouvelleQuantite }
                : c,
            );
          else
            nC.push({
              id: `temp-${produitId}`,
              produit_id: produitId,
              quantite: nouvelleQuantite,
            });
          return { ...t, minibar_consommations: nC };
        }
        return t;
      }),
    );

    if (consoActuelle) {
      if (nouvelleQuantite === 0)
        await supabase
          .from("minibar_consommations")
          .delete()
          .eq("id", consoActuelle.id);
      else
        await supabase
          .from("minibar_consommations")
          .update({ quantite: nouvelleQuantite })
          .eq("id", consoActuelle.id);
    } else if (nouvelleQuantite > 0) {
      const { data } = await supabase
        .from("minibar_consommations")
        .insert({
          tache_id: tacheId,
          produit_id: produitId,
          quantite: nouvelleQuantite,
        })
        .select()
        .single();
      if (data)
        setTaches((prev) =>
          prev.map((t) =>
            t.id === tacheId
              ? {
                  ...t,
                  minibar_consommations: t.minibar_consommations.map((c) =>
                    c.produit_id === produitId
                      ? (data as MinibarConsommation)
                      : c,
                  ),
                }
              : t,
          ),
        );
    }
    // --- CALCUL DU TOTAL EN BASE DE DONNÉES ---
    const produit = produits.find((p) => p.id === produitId);
    if (produit && produit.prix !== undefined) {
      // 1. On récupère le total actuel de la réservation
      const { data: resa } = await supabase
        .from("reservations")
        .select("conso_minibar")
        .eq("id", tache.reservation_id)
        .single();

      const ancienTotal = resa?.conso_minibar || 0;

      // 2. On calcule le nouveau total (changement est +1 ou -1)
      let nouveauTotal = ancienTotal + changement * produit.prix;
      if (nouveauTotal < 0) nouveauTotal = 0; // Sécurité anti-négatif

      // 3. On met à jour la réservation silencieusement
      await supabase
        .from("reservations")
        .update({ conso_minibar: nouveauTotal })
        .eq("id", tache.reservation_id);
    }
  };

  // --- ACTIONS RÉCURRENTES ---
  const validerTacheRecurrente = async (idTache: string) => {
    setTachesRecurrentes((prev) =>
      prev.map((t) =>
        t.id === idTache ? { ...t, derniere_execution: aujourdhui } : t,
      ),
    );
    await supabase
      .from("taches_recurrentes")
      .update({ derniere_execution: aujourdhui })
      .eq("id", idTache);
  };

  const calculerStatutDelai = (
    derniereExecution: string,
    frequenceJours: number,
  ) => {
    const timeDiff =
      new Date(aujourdhui).getTime() - new Date(derniereExecution).getTime();
    const joursPasses = Math.floor(timeDiff / (1000 * 3600 * 24));
    const joursRestants = frequenceJours - joursPasses;

    if (joursRestants < 0)
      return {
        texte: `En retard de ${Math.abs(joursRestants)}j`,
        couleur: "white",
        bg: ORANGE_CALIFORNIA,
        estUrgent: true,
      };
    if (joursRestants <= 5)
      return {
        texte: `Dans ${joursRestants}j`,
        couleur: "#333",
        bg: "#ffeb3b",
        estUrgent: true,
      };
    return {
      texte: `Dans ${joursRestants}j`,
      couleur: "#333",
      bg: "#e0e0e0",
      estUrgent: false,
    };
  };

  const recurrentesParChambre = tachesRecurrentes.reduce(
    (acc, tache) => {
      const nomChambre = tache.chambres?.nom || "Autre";
      if (!acc[nomChambre]) acc[nomChambre] = [];
      acc[nomChambre].push(tache);
      return acc;
    },
    {} as Record<string, TacheRecurrente[]>,
  );

  // --- LOGIQUE DE FILTRAGE (Aujourd'hui + Futur si activé + UNIQUEMENT Arrivées pour le futur) ---
  const tachesFiltrees = taches.filter((t) => {
    // 1. Toujours afficher les tâches d'aujourd'hui et celles en retard (passé)
    if (t.date_prevue <= aujourdhui) return true;

    // 2. Si le bouton "Afficher prochaines" est activé, on affiche le futur...
    // MAIS on force à ne montrer QUE les "Arrivées" (impossible d'anticiper un départ/intermédiaire)
    if (afficherProchaines && t.type_tache === "Arrivée") return true;

    return false;
  });

  return (
    // CONTENEUR PRINCIPAL ÉLARGI ET RESPONSIVE
    <div
      style={{
        width: "95%",
        maxWidth: "900px",
        margin: "0 auto",
        padding: "20px 0",
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          backgroundColor: BLEU_CALIFORNIA,
          color: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 4px 12px rgba(0, 156, 216, 0.3)",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>
          Planning du ménage
        </h1>
        <button
          onClick={() => navigate("/admin")}
          style={{
            backgroundColor: "transparent",
            border: "2px solid white",
            color: "white",
            padding: "10px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
          }}
        >
          Menu administrateur
        </button>
      </header>

      {/* BOUTONS D'ONGLETS */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setOngletActif("QUOTIDIEN")}
          style={{
            flex: "1 1 auto",
            padding: "16px",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            fontSize: "16px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            backgroundColor:
              ongletActif === "QUOTIDIEN" ? ORANGE_CALIFORNIA : "white",
            color: ongletActif === "QUOTIDIEN" ? "white" : "#666",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          Réservations
        </button>
        <button
          onClick={() => setOngletActif("RECURRENTES")}
          style={{
            flex: "1 1 auto",
            padding: "16px",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            fontSize: "16px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            backgroundColor:
              ongletActif === "RECURRENTES" ? ORANGE_CALIFORNIA : "white",
            color: ongletActif === "RECURRENTES" ? "white" : "#666",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          Tâches récurrentes
        </button>
      </div>

      {chargement ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "#666",
            fontSize: "18px",
          }}
        >
          Chargement des données...
        </div>
      ) : ongletActif === "QUOTIDIEN" ? (
        /* ONGLET 1 : TÂCHES QUOTIDIENNES */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tachesFiltrees.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                backgroundColor: "white",
                borderRadius: "12px",
                border: "2px dashed #ccc",
              }}
            >
              <h2 style={{ color: BLEU_CALIFORNIA, margin: 0 }}>
                Aucune tâche en attente ! 🎉
              </h2>
            </div>
          ) : (
            tachesFiltrees.map((tache) => {
              const estTermine = tache.statut === "TERMINÉ";
              const estDansLeFutur = tache.date_prevue > aujourdhui;

              return (
                <div
                  key={tache.id}
                  style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    borderLeft: `6px solid ${estTermine ? BLEU_CALIFORNIA : ORANGE_CALIFORNIA}`,
                    transition: "all 0.2s ease",
                    opacity: estTermine ? 0.8 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: "1 1 200px" }}>
                      <strong
                        style={{
                          fontSize: "18px",
                          display: "block",
                          marginBottom: "6px",
                          color: "#333",
                        }}
                      >
                        {tache.chambres?.nom} – {tache.type_tache}
                      </strong>

                      {/* Distinguer le futur du passé (retard) */}
                      {tache.date_prevue !== aujourdhui && !estTermine && (
                        <span
                          style={{
                            fontSize: "13px",
                            color: estDansLeFutur
                              ? BLEU_CALIFORNIA
                              : ORANGE_CALIFORNIA,
                            fontWeight: "bold",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          {estDansLeFutur
                            ? "🗓️ À faire en avance pour le :"
                            : "⚠️ En retard depuis le :"}{" "}
                          {formaterDate(tache.date_prevue)}
                        </span>
                      )}

                      <div style={{ fontSize: "15px", color: "#666" }}>
                        Client :{" "}
                        <strong>
                          {tache.reservations?.nom_client || "Non renseigné"}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "12px",
                        flex: "1 1 auto",
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: estTermine ? "#e1f5fe" : "#fbe9e7",
                          color: estTermine
                            ? BLEU_CALIFORNIA
                            : ORANGE_CALIFORNIA,
                          padding: "6px 12px",
                          borderRadius: "20px",
                          fontSize: "14px",
                          fontWeight: "bold",
                        }}
                      >
                        {tache.statut}
                      </span>
                      {!estTermine && (
                        <button
                          onClick={() => marquerCommeTerminee(tache.id)}
                          style={{
                            padding: "10px 16px",
                            backgroundColor: BLEU_CALIFORNIA,
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "bold",
                            width: "100%",
                            textAlign: "center",
                          }}
                        >
                          ✓ Valider la tâche
                        </button>
                      )}
                    </div>
                  </div>

                  {/* BOUTON DÉPLIER CHECKLIST */}
                  <button
                    onClick={() =>
                      setTacheDepliee(
                        tacheDepliee === tache.id ? null : tache.id,
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "14px",
                      marginTop: "8px",
                      backgroundColor:
                        tacheDepliee === tache.id ? "#e0e0e0" : "#f5f5f5",
                      color: "#333",
                      border:
                        tacheDepliee === tache.id ? "none" : "1px solid #ddd",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: "15px",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {tacheDepliee === tache.id
                      ? "▲ Fermer les détails"
                      : "▼ Check-list & Minibar"}
                  </button>

                  {/* CONTENU CHECKLIST ET MINIBAR */}
                  {tacheDepliee === tache.id && (
                    <div
                      style={{
                        marginTop: "20px",
                        paddingTop: "20px",
                        borderTop: "2px solid #eee",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 16px 0",
                          fontSize: "16px",
                          color: BLEU_CALIFORNIA,
                        }}
                      >
                        📝 Check-list à vérifier :
                      </h4>

                      {/* --- CHECKLIST CONDENSÉE (Grille) --- */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(220px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        {tache.tache_items_execution.length === 0 ? (
                          <p
                            style={{
                              margin: 0,
                              color: "#888",
                              fontStyle: "italic",
                            }}
                          >
                            Aucune sous-tâche.
                          </p>
                        ) : (
                          tache.tache_items_execution
                            .sort((a, b) => a.ordre - b.ordre)
                            .map((item) => (
                              <label
                                key={item.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "8px 12px",
                                  backgroundColor: item.est_fait
                                    ? "#f9f9f9"
                                    : "white",
                                  border: "1px solid #eee",
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  opacity: item.est_fait ? 0.6 : 1,
                                  textDecoration: item.est_fait
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={item.est_fait}
                                  onChange={() =>
                                    toggleItem(tache.id, item.id, item.est_fait)
                                  }
                                  style={{
                                    marginRight: "10px",
                                    width: "18px",
                                    height: "18px",
                                    cursor: "pointer",
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: "14px",
                                    color: "#444",
                                    lineHeight: "1.3",
                                  }}
                                >
                                  {item.libelle}
                                </span>
                              </label>
                            ))
                        )}
                      </div>

                      {(tache.type_tache === "Départ" ||
                        tache.type_tache === "Intermédiaire") && (
                        <div
                          style={{
                            marginTop: "30px",
                            paddingTop: "20px",
                            borderTop: "2px dashed #ccc",
                          }}
                        >
                          <h4
                            style={{
                              margin: "0 0 16px 0",
                              fontSize: "16px",
                              color: BLEU_CALIFORNIA,
                            }}
                          >
                            🥤 Consommations Minibar :
                          </h4>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(250px, 1fr))",
                              gap: "12px",
                            }}
                          >
                            {produits.map((produit) => {
                              const conso = tache.minibar_consommations.find(
                                (c) => c.produit_id === produit.id,
                              );
                              const quantite = conso ? conso.quantite : 0;
                              return (
                                <div
                                  key={produit.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    backgroundColor: "#f9f9f9",
                                    padding: "12px 16px",
                                    borderRadius: "8px",
                                    border: "1px solid #eee",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "15px",
                                      color: "#444",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {produit.nom}
                                  </span>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "16px",
                                    }}
                                  >
                                    <button
                                      onClick={() =>
                                        modifierConso(tache.id, produit.id, -1)
                                      }
                                      disabled={quantite === 0}
                                      style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "50%",
                                        border: "1px solid #ccc",
                                        backgroundColor:
                                          quantite === 0 ? "#eee" : "white",
                                        color: quantite === 0 ? "#aaa" : "#333",
                                        cursor:
                                          quantite === 0
                                            ? "not-allowed"
                                            : "pointer",
                                        fontWeight: "bold",
                                        fontSize: "18px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      -
                                    </button>
                                    <span
                                      style={{
                                        width: "24px",
                                        textAlign: "center",
                                        fontWeight: "bold",
                                        fontSize: "16px",
                                        color: BLEU_CALIFORNIA,
                                      }}
                                    >
                                      {quantite}
                                    </span>
                                    <button
                                      onClick={() =>
                                        modifierConso(tache.id, produit.id, 1)
                                      }
                                      style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "50%",
                                        border: "none",
                                        backgroundColor: BLEU_CALIFORNIA,
                                        color: "white",
                                        cursor: "pointer",
                                        fontWeight: "bold",
                                        fontSize: "18px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* --- BOUTON FERMER EN BAS DE DÉTAIL --- */}
                      <button
                        onClick={() => setTacheDepliee(null)}
                        style={{
                          width: "100%",
                          padding: "14px",
                          marginTop: "24px",
                          backgroundColor: "#e0e0e0",
                          color: "#333",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "15px",
                          transition: "all 0.2s ease",
                        }}
                      >
                        ▲ Fermer les détails
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* BOUTON VOIR PROCHAINES ARRIVÉES */}
          <button
            onClick={() => setAfficherProchaines(!afficherProchaines)}
            style={{
              marginTop: "8px",
              padding: "16px",
              backgroundColor: "white",
              color: BLEU_CALIFORNIA,
              border: `2px dashed ${BLEU_CALIFORNIA}`,
              borderRadius: "12px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "16px",
              textAlign: "center",
              width: "100%",
              transition: "all 0.2s ease",
            }}
          >
            {afficherProchaines
              ? "▲ Masquer les arrivées des prochains jours"
              : "▼ Voir les prochaines arrivées"}
          </button>
        </div>
      ) : (
        /* ONGLET 2 : TÂCHES RÉCURRENTES (ACCORDÉON) */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              color: "#666",
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            Cliquez sur une chambre pour voir les tâches récurrentes associées
          </p>

          {Object.entries(recurrentesParChambre).map(
            ([nomChambre, tachesChambre]) => {
              const estDepliee = chambreDepliee === nomChambre;

              // Calcul du nombre de tâches urgentes/en retard pour le badge
              const nbUrgentes = tachesChambre.filter(
                (t) =>
                  calculerStatutDelai(t.derniere_execution, t.frequence_jours)
                    .estUrgent,
              ).length;

              return (
                <div
                  key={nomChambre}
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                >
                  {/* En-tête CLICQUABLE */}
                  <div
                    onClick={() =>
                      setChambreDepliee(estDepliee ? null : nomChambre)
                    }
                    style={{
                      backgroundColor: estDepliee ? "#e1f5fe" : "white",
                      padding: "20px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: estDepliee ? "2px solid #b3e5fc" : "none",
                      transition: "background-color 0.2s",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: BLEU_CALIFORNIA,
                        fontSize: "18px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      🛏️ {nomChambre}
                      {nbUrgentes > 0 && (
                        <span
                          style={{
                            backgroundColor: ORANGE_CALIFORNIA,
                            color: "white",
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          {nbUrgentes} prioritaire{nbUrgentes > 1 ? "s" : ""}
                        </span>
                      )}
                    </h3>
                    <span
                      style={{
                        color: BLEU_CALIFORNIA,
                        fontWeight: "bold",
                        fontSize: "14px",
                      }}
                    >
                      {estDepliee ? "▲ FERMER" : "▼ OUVRIR"}
                    </span>
                  </div>

                  {/* Liste des tâches DÉPLIANTE TRIÉE PAR FRÉQUENCE */}
                  {estDepliee && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "0 20px 20px 20px",
                      }}
                    >
                      {/* LOGIQUE DE GROUPEMENT PAR FRÉQUENCE */}
                      {(() => {
                        // 1. Grouper par fréquence
                        const tachesParFrequence = tachesChambre.reduce(
                          (acc, tache) => {
                            if (!acc[tache.frequence_jours])
                              acc[tache.frequence_jours] = [];
                            acc[tache.frequence_jours].push(tache);
                            return acc;
                          },
                          {} as Record<number, TacheRecurrente[]>,
                        );

                        // 2. Trier les fréquences (30, puis 90, puis 180...)
                        const frequencesTriees = Object.keys(tachesParFrequence)
                          .map(Number)
                          .sort((a, b) => a - b);

                        return frequencesTriees.map((freq) => (
                          <div
                            key={freq}
                            style={{ marginBottom: "24px", marginTop: "16px" }}
                          >
                            <h4
                              style={{
                                margin: "0 0 12px 0",
                                color: "#888",
                                fontSize: "13px",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                              }}
                            >
                              ⏳ À faire tous les {freq} jours
                            </h4>

                            {/* Les Pilules condensées */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "12px",
                              }}
                            >
                              {tachesParFrequence[freq]
                                .sort((a, b) => {
                                  // Tri par urgence à l'intérieur d'une même fréquence
                                  const timeA =
                                    new Date(aujourdhui).getTime() -
                                    new Date(a.derniere_execution).getTime();
                                  const timeB =
                                    new Date(aujourdhui).getTime() -
                                    new Date(b.derniere_execution).getTime();
                                  const restA =
                                    a.frequence_jours -
                                    Math.floor(timeA / (1000 * 3600 * 24));
                                  const restB =
                                    b.frequence_jours -
                                    Math.floor(timeB / (1000 * 3600 * 24));
                                  return restA - restB;
                                })
                                .map((tache) => {
                                  const statut = calculerStatutDelai(
                                    tache.derniere_execution,
                                    tache.frequence_jours,
                                  );

                                  return (
                                    <button
                                      key={tache.id}
                                      onClick={() => {
                                        // Avertissement de sécurité pour les clics accidentels
                                        if (
                                          window.confirm(
                                            `Valider l'entretien "${tache.libelle}" comme fait aujourd'hui ?`,
                                          )
                                        ) {
                                          validerTacheRecurrente(tache.id);
                                        }
                                      }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "10px 16px",
                                        backgroundColor: "white",
                                        border: `2px solid ${statut.estUrgent ? ORANGE_CALIFORNIA : "#eee"}`,
                                        borderRadius: "20px",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        boxShadow: statut.estUrgent
                                          ? `0 2px 8px ${ORANGE_CALIFORNIA}40`
                                          : "0 2px 4px rgba(0,0,0,0.05)",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: "14px",
                                          fontWeight: "bold",
                                          color: "#333",
                                        }}
                                      >
                                        {tache.libelle}
                                      </span>
                                      <span
                                        style={{
                                          backgroundColor: statut.bg,
                                          color: statut.couleur,
                                          padding: "4px 8px",
                                          borderRadius: "12px",
                                          fontSize: "11px",
                                          fontWeight: "bold",
                                        }}
                                      >
                                        {statut.texte}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        ));
                      })()}

                      {/* BOUTON FERMER EN BAS DE CARTE RÉCURRENTE */}
                      <button
                        onClick={() => setChambreDepliee(null)}
                        style={{
                          marginTop: "8px",
                          padding: "14px",
                          backgroundColor: "#e0e0e0",
                          color: "#333",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "14px",
                          textAlign: "center",
                          width: "100%",
                          transition: "0.2s",
                        }}
                      >
                        ▲ FERMER LA LISTE
                      </button>
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

export default Menage;
