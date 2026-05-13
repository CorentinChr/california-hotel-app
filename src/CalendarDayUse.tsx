import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

// --- TYPAGES ---
interface Chambre {
  id: string;
  nom: string;
}

interface DayUse {
  id: string;
  date_reservation: string;
  chambre_id: string;
  periode: "Matin" | "Après-midi" | "Journée entière";
  nom_client: string;
  contact: string;
  prix: number;
  options: string;
  notes_supplementaires: string;
  chambres?: { nom: string };
  reservation_id: string;
}

const MOIS_NOMS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function CalendarDayUse() {
  const navigate = useNavigate();

  // --- COULEURS ---
  const BLEU_CALIFORNIA = "#009CD8";
  const ORANGE_CALIFORNIA = "#E95219";

  // --- ÉTATS ---
  const [moisActuel, setMoisActuel] = useState(new Date().getMonth());
  const [anneeActuelle, setAnneeActuelle] = useState(new Date().getFullYear());

  const [dayUses, setDayUses] = useState<DayUse[]>([]);
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [chargement, setChargement] = useState(false);

  // États pour la modale du jour
  const [jourSelectionne, setJourSelectionne] = useState<number | null>(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);

  // État du formulaire
  const [form, setForm] = useState({
    chambre_id: "",
    periode: "Matin",
    nom_client: "",
    contact: "",
    prix: 0,
    options: "",
    notes_supplementaires: "",
  });

  // --- CHARGEMENT DES DONNÉES ---
  useEffect(() => {
    chargerChambres();
  }, []);

  useEffect(() => {
    chargerDayUses();
  }, [moisActuel, anneeActuelle]);

  const chargerChambres = async () => {
    const { data } = await supabase
      .from("chambres")
      .select("id, nom")
      .order("nom");
    if (data) setChambres(data);
  };

  const chargerDayUses = async () => {
    setChargement(true);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const premierJour = `${anneeActuelle}-${pad(moisActuel + 1)}-01`;
    const nbJours = new Date(anneeActuelle, moisActuel + 1, 0).getDate();
    const dernierJour = `${anneeActuelle}-${pad(moisActuel + 1)}-${pad(nbJours)}`;

    const { data } = await supabase
      .from("day_use")
      .select(`*, chambres ( nom )`)
      .gte("date_reservation", premierJour)
      .lte("date_reservation", dernierJour)
      .order("date_reservation", { ascending: true });

    if (data) setDayUses(data as DayUse[]);
    setChargement(false);
  };

  // --- NAVIGATION CALENDRIER ---
  const moisPrecedent = () => {
    if (moisActuel === 0) {
      setMoisActuel(11);
      setAnneeActuelle(anneeActuelle - 1);
    } else {
      setMoisActuel(moisActuel - 1);
    }
  };
  const moisSuivant = () => {
    if (moisActuel === 11) {
      setMoisActuel(0);
      setAnneeActuelle(anneeActuelle + 1);
    } else {
      setMoisActuel(moisActuel + 1);
    }
  };

  // --- CALCUL DU CALENDRIER ---
  const nbJoursDansMois = new Date(anneeActuelle, moisActuel + 1, 0).getDate();
  const premierJourIndex = new Date(anneeActuelle, moisActuel, 1).getDay();
  const decalageDebut = premierJourIndex === 0 ? 6 : premierJourIndex - 1; // Pour que Lundi soit 0

  const joursArray = Array.from({ length: nbJoursDansMois }, (_, i) => i + 1);
  const casesVides = Array.from({ length: decalageDebut }, (_, i) => i);

  // --- ACTIONS ---
  const ouvrirJour = (jour: number) => {
    setJourSelectionne(jour);
    setAfficherFormulaire(false);
    setForm({
      ...form,
      chambre_id: chambres[0]?.id || "",
      prix: 0,
      nom_client: "",
      contact: "",
      options: "",
      notes_supplementaires: "",
    });
  };

  const sauvegarderDayUse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jourSelectionne) return;

    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateResa = `${anneeActuelle}-${pad(moisActuel + 1)}-${pad(jourSelectionne)}`;

    // 1. CRÉATION DE LA RÉSERVATION UNIFIÉE (Pour tromper le système et le minibar)
    const { data: resaData, error: resaError } = await supabase
      .from("reservations")
      .insert([
        {
          lodgify_id: `dayuse-${Date.now()}`, // ID fictif pour éviter les conflits Lodgify
          chambre_id: form.chambre_id,
          nom_client: `${form.nom_client} (Day Use)`,
          date_arrivee: dateResa,
          date_depart: dateResa,
          statut: "Booked",
          options_json: {
            Type: "Day Use",
            Période: form.periode,
            Options: form.options,
          },
        },
      ])
      .select()
      .single();

    if (resaError || !resaData) {
      alert("Erreur lors de la création de la réservation source.");
      return;
    }

    // 2. SAUVEGARDE DU DAY USE (lié à la réservation)
    const { data: dayUseData, error: dayUseError } = await supabase
      .from("day_use")
      .insert([
        {
          date_reservation: dateResa,
          chambre_id: form.chambre_id,
          periode: form.periode,
          nom_client: form.nom_client,
          contact: form.contact,
          prix: form.prix,
          options: form.options,
          notes_supplementaires: form.notes_supplementaires,
          reservation_id: resaData.id, // <-- LE LIEN EST FAIT ICI
        },
      ])
      .select("*, chambres(nom)")
      .single();

    if (dayUseError) {
      alert("Réservation créée, mais erreur sur le Day Use.");
      return;
    }

    // 3. CRÉATION DE LA TÂCHE DE MÉNAGE
    const typeDeMénage = "Ménage Day Use";

    const { data: nouvelleTache, error: tacheError } = await supabase
      .from("taches")
      .insert([
        {
          date_prevue: dateResa,
          chambre_id: form.chambre_id,
          reservation_id: resaData.id, // <-- LE LIEN MAGIQUE POUR LE MINIBAR
          type_tache: typeDeMénage,
          statut: "A FAIRE",
          commentaire: `☀️ DAY USE (${form.periode}) - Contact: ${form.contact || "N/A"}. ${form.options ? "Options: " + form.options : ""}`,
        },
      ])
      .select()
      .single();

    if (!tacheError && nouvelleTache) {
      // 4. GÉNÉRATION DE LA CHECK-LIST
      const { data: modeles } = await supabase
        .from("checklist_modeles")
        .select("*")
        .eq("type_tache", typeDeMénage)
        .eq("est_actif", true);

      if (modeles && modeles.length > 0) {
        const sousTaches = modeles.map((m) => ({
          tache_id: nouvelleTache.id,
          libelle: m.libelle,
          ordre: m.ordre,
        }));
        await supabase.from("tache_items_execution").insert(sousTaches);
      }
    }

    if (dayUseData) {
      setDayUses([...dayUses, dayUseData as DayUse]);
      setAfficherFormulaire(false);
      alert("Succès : Réservation, Day Use et Ménage générés !");
    }
  };

  const supprimerDayUse = async (resaDayUse: DayUse) => {
    if (
      window.confirm(
        "Supprimer cette réservation Day Use, sa tâche de ménage et son dossier ?",
      )
    ) {
      // On supprime en cascade à partir de la racine : la réservation
      if (resaDayUse.reservation_id) {
        // La suppression des tâches est manuelle pour plus de sécurité (si pas de cascade configurée)
        await supabase
          .from("taches")
          .delete()
          .eq("reservation_id", resaDayUse.reservation_id);
        // Supprime le Day Use
        await supabase.from("day_use").delete().eq("id", resaDayUse.id);
        // Supprime la réservation racine
        await supabase
          .from("reservations")
          .delete()
          .eq("id", resaDayUse.reservation_id);
      } else {
        // Fallback de sécurité au cas où
        await supabase.from("day_use").delete().eq("id", resaDayUse.id);
      }

      setDayUses(dayUses.filter((d) => d.id !== resaDayUse.id));
    }
  };

  // Les DayUses du jour sélectionné
  const dayUsesDuJour = jourSelectionne
    ? dayUses.filter(
        (d) => parseInt(d.date_reservation.split("-")[2]) === jourSelectionne,
      )
    : [];

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          backgroundColor: "#ff9800",
          color: "white",
          padding: "16px 24px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "22px" }}>☀️ Gestion Day Use</h1>
        <button
          onClick={() => navigate("/admin")}
          style={{
            backgroundColor: "white",
            color: "#ff9800",
            border: "none",
            padding: "8px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          ← Retour Admin Lodgify
        </button>
      </header>

      {/* SÉLECTEUR DE MOIS */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "20px",
          marginBottom: "20px",
          backgroundColor: "white",
          padding: "16px",
          borderRadius: "12px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <button
          onClick={moisPrecedent}
          style={{
            padding: "8px 16px",
            fontSize: "18px",
            cursor: "pointer",
            border: "1px solid #ccc",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          ◀
        </button>
        <h2
          style={{
            margin: 0,
            fontSize: "22px",
            color: "#333",
            minWidth: "220px",
            textAlign: "center",
          }}
        >
          {MOIS_NOMS[moisActuel]} {anneeActuelle}
        </h2>
        <button
          onClick={moisSuivant}
          style={{
            padding: "8px 16px",
            fontSize: "18px",
            cursor: "pointer",
            border: "1px solid #ccc",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          ▶
        </button>
      </div>

      {/* GRILLE DU CALENDRIER */}
      <div
        style={{
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          {JOURS_SEMAINE.map((j) => (
            <div
              key={j}
              style={{
                textAlign: "center",
                fontWeight: "bold",
                color: "#666",
                fontSize: "14px",
              }}
            >
              {j}
            </div>
          ))}
        </div>

        {chargement ? (
          <p style={{ textAlign: "center", padding: "20px" }}>Chargement...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "10px",
            }}
          >
            {casesVides.map((_, i) => (
              <div
                key={`vide-${i}`}
                style={{
                  padding: "40px 10px",
                  backgroundColor: "#fafafa",
                  borderRadius: "8px",
                }}
              ></div>
            ))}

            {joursArray.map((jour) => {
              const resasCeJour = dayUses.filter(
                (d) => parseInt(d.date_reservation.split("-")[2]) === jour,
              );
              const isToday =
                jour === new Date().getDate() &&
                moisActuel === new Date().getMonth() &&
                anneeActuelle === new Date().getFullYear();

              return (
                <div
                  key={jour}
                  onClick={() => ouvrirJour(jour)}
                  style={{
                    minHeight: "80px",
                    padding: "10px",
                    backgroundColor: isToday ? "#fff3e0" : "white",
                    border: isToday ? `2px solid #ff9800` : "1px solid #ddd",
                    borderRadius: "8px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.borderColor = "#ff9800")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.borderColor = isToday
                      ? "#ff9800"
                      : "#ddd")
                  }
                >
                  <strong
                    style={{
                      alignSelf: "flex-end",
                      color: isToday ? "#ff9800" : "#333",
                    }}
                  >
                    {jour}
                  </strong>
                  {resasCeJour.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        backgroundColor: "#e1f5fe",
                        color: BLEU_CALIFORNIA,
                        fontSize: "11px",
                        padding: "4px",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.chambres?.nom} ({r.periode})
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALE DU JOUR SÉLECTIONNÉ */}
      {jourSelectionne && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ margin: 0 }}>
                Réservations du {jourSelectionne} {MOIS_NOMS[moisActuel]}
              </h2>
              <button
                onClick={() => setJourSelectionne(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                }}
              >
                ✖
              </button>
            </div>

            {!afficherFormulaire && (
              <>
                {dayUsesDuJour.length === 0 ? (
                  <p style={{ color: "#666", fontStyle: "italic" }}>
                    Aucune réservation Day Use ce jour.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      marginBottom: "20px",
                    }}
                  >
                    {dayUsesDuJour.map((resa) => (
                      <div
                        key={resa.id}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: "8px",
                          padding: "16px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                          }}
                        >
                          <h3 style={{ margin: 0, color: "#333" }}>
                            {resa.nom_client}
                          </h3>
                          <span
                            style={{
                              backgroundColor: "#ffeb3b",
                              color: "#333",
                              padding: "4px 8px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            {resa.periode}
                          </span>
                        </div>
                        <p style={{ margin: "4px 0", fontSize: "14px" }}>
                          <strong>Chambre :</strong> {resa.chambres?.nom}
                        </p>
                        <p style={{ margin: "4px 0", fontSize: "14px" }}>
                          <strong>Contact :</strong>{" "}
                          {resa.contact || "Non renseigné"}
                        </p>
                        <p style={{ margin: "4px 0", fontSize: "14px" }}>
                          <strong>Options :</strong> {resa.options || "Aucune"}
                        </p>
                        <p
                          style={{
                            margin: "4px 0",
                            fontSize: "14px",
                            color: "#4caf50",
                            fontWeight: "bold",
                          }}
                        >
                          <strong>Prix :</strong> {resa.prix} €
                        </p>
                        {resa.notes_supplementaires && (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "10px",
                              backgroundColor: "#f9f9f9",
                              fontSize: "13px",
                              borderRadius: "6px",
                            }}
                          >
                            <strong>Notes :</strong> <br />
                            {resa.notes_supplementaires}
                          </div>
                        )}
                        <button
                          onClick={() => supprimerDayUse(resa)}
                          style={{
                            marginTop: "12px",
                            backgroundColor: "#ffebee",
                            color: "#f44336",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setAfficherFormulaire(true)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: ORANGE_CALIFORNIA,
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: "16px",
                  }}
                >
                  + Ajouter un Day Use
                </button>
              </>
            )}

            {afficherFormulaire && (
              <form
                onSubmit={sauvegarderDayUse}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <h3 style={{ margin: "0 0 10px 0", color: ORANGE_CALIFORNIA }}>
                  Nouvelle réservation
                </h3>

                <select
                  value={form.chambre_id}
                  onChange={(e) =>
                    setForm({ ...form, chambre_id: e.target.value })
                  }
                  required
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                >
                  <option value="" disabled>
                    -- Sélectionner une suite --
                  </option>
                  {chambres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>

                <select
                  value={form.periode}
                  onChange={(e) =>
                    setForm({ ...form, periode: e.target.value as any })
                  }
                  required
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                >
                  <option value="Matin">Matin</option>
                  <option value="Après-midi">Après-midi</option>
                  <option value="Journée entière">Journée entière</option>
                </select>

                <input
                  type="text"
                  placeholder="Nom du client"
                  required
                  value={form.nom_client}
                  onChange={(e) =>
                    setForm({ ...form, nom_client: e.target.value })
                  }
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />

                <input
                  type="text"
                  placeholder="Contact (Téléphone / Email)"
                  value={form.contact}
                  onChange={(e) =>
                    setForm({ ...form, contact: e.target.value })
                  }
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />

                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <label>Prix facturé (€) :</label>
                  <input
                    type="number"
                    min="0"
                    value={form.prix}
                    onChange={(e) =>
                      setForm({ ...form, prix: parseFloat(e.target.value) })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      width: "100px",
                    }}
                  />
                </div>

                <input
                  type="text"
                  placeholder="Options (ex: Champagne, Pétales...)"
                  value={form.options}
                  onChange={(e) =>
                    setForm({ ...form, options: e.target.value })
                  }
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />

                <textarea
                  placeholder="Notes supplémentaires..."
                  value={form.notes_supplementaires}
                  onChange={(e) =>
                    setForm({ ...form, notes_supplementaires: e.target.value })
                  }
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    minHeight: "80px",
                    fontFamily: "inherit",
                  }}
                />

                <div
                  style={{ display: "flex", gap: "10px", marginTop: "10px" }}
                >
                  <button
                    type="button"
                    onClick={() => setAfficherFormulaire(false)}
                    style={{
                      flex: 1,
                      padding: "12px",
                      backgroundColor: "#e0e0e0",
                      color: "#333",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: "12px",
                      backgroundColor: ORANGE_CALIFORNIA,
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    💾 Enregistrer
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarDayUse;
