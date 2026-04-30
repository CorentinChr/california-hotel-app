import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// --- TYPAGES ---
interface Reservation {
  id: string;
  nom_client: string;
  date_arrivee: string;
  date_depart: string;
  chambres: { nom: string };
  options_json: Record<string, any>;
  statut: string;
}

interface TacheInfo {
  id: string;
  date_prevue: string;
  type_tache: string;
  statut: string;
}

interface ConsoAgregee {
  nom: string;
  quantite: number;
}

function Admin() {
  // --- ÉTATS (MÉMOIRE) ---
  const [motDePasse, setMotDePasse] = useState("");
  const [estConnecte, setEstConnecte] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [chargement, setChargement] = useState(false);
  const [reservationSelectionnee, setReservationSelectionnee] =
    useState<Reservation | null>(null);
  const [afficherAnciennes, setAfficherAnciennes] = useState(false);
  const [optionsDisponibles, setOptionsDisponibles] = useState<string[]>([]);

  // NOUVEAU : États pour stocker les détails de la réservation sélectionnée
  const [tachesResa, setTachesResa] = useState<TacheInfo[]>([]);
  const [consosResa, setConsosResa] = useState<ConsoAgregee[]>([]);
  const [chargementDetails, setChargementDetails] = useState(false);

  const motDePasseSecret = "california2026";

  const verifierMotDePasse = (e: React.FormEvent) => {
    e.preventDefault();
    if (motDePasse === motDePasseSecret) {
      setEstConnecte(true);
    } else {
      alert("Mot de passe incorrect");
    }
  };

  useEffect(() => {
    if (estConnecte) {
      chargerReservations();
      chargerOptions();
    }
  }, [estConnecte, afficherAnciennes]);

  // NOUVEAU : Se déclenche automatiquement quand tu ouvres une Fiche Détail
  useEffect(() => {
    if (reservationSelectionnee) {
      chargerDetailsReservation(reservationSelectionnee.id);
    }
  }, [reservationSelectionnee?.id]); // On surveille juste l'ID pour ne pas recharger en boucle

  const chargerOptions = async () => {
    const { data, error } = await supabase
      .from("checklist_options")
      .select("mot_cle")
      .not("mot_cle", "is", null);
    if (!error && data) {
      const motsClesUniques = Array.from(
        new Set(data.map((item) => item.mot_cle)),
      );
      setOptionsDisponibles(motsClesUniques as string[]);
    }
  };

  const chargerReservations = async () => {
    setChargement(true);
    const aujourdhui = new Date().toISOString().split("T")[0];

    let requete = supabase
      .from("reservations")
      .select(
        `id, nom_client, date_arrivee, date_depart, statut, options_json, chambres ( nom )`,
      )
      .order("date_arrivee", { ascending: !afficherAnciennes });

    if (!afficherAnciennes) requete = requete.gte("date_depart", aujourdhui);

    const { data, error } = await requete;
    if (error) {
      console.error("Erreur chargement résas:", error);
    } else if (data) {
      setReservations(data as unknown as Reservation[]);
      if (reservationSelectionnee) {
        const resaAJour = data.find((r) => r.id === reservationSelectionnee.id);
        if (resaAJour)
          setReservationSelectionnee(resaAJour as unknown as Reservation);
      }
    }
    setChargement(false);
  };

  // NOUVEAU : La fonction qui charge l'historique et additionne le minibar
  const chargerDetailsReservation = async (reservationId: string) => {
    setChargementDetails(true);

    // 1. On récupère toutes les tâches du séjour
    const { data: tachesData } = await supabase
      .from("taches")
      .select("id, date_prevue, type_tache, statut")
      .eq("reservation_id", reservationId)
      .order("date_prevue", { ascending: true });

    if (tachesData) {
      setTachesResa(tachesData);

      const tacheIds = tachesData.map((t) => t.id);

      // 2. On récupère les consos liées UNIQUEMENT à ces tâches
      if (tacheIds.length > 0) {
        const { data: consosData } = await supabase
          .from("minibar_consommations")
          .select("quantite, minibar_produits(nom)")
          .in("tache_id", tacheIds);

        if (consosData) {
          // On additionne les quantités par nom de produit (La calculatrice automatique !)
          const recapitulatif: Record<string, ConsoAgregee> = {};

          // Note : on type en 'any' temporairement ici car Supabase renvoie un objet imbriqué complexe
          consosData.forEach((conso: any) => {
            const nomProduit = conso.minibar_produits?.nom || "Produit inconnu";
            if (!recapitulatif[nomProduit]) {
              recapitulatif[nomProduit] = { nom: nomProduit, quantite: 0 };
            }
            recapitulatif[nomProduit].quantite += conso.quantite;
          });

          setConsosResa(Object.values(recapitulatif));
        } else {
          setConsosResa([]);
        }
      } else {
        setConsosResa([]);
      }
    }
    setChargementDetails(false);
  };

  const toggleOption = async (optionNom: string) => {
    if (!reservationSelectionnee) return;
    const optionsActuelles = reservationSelectionnee.options_json || {};
    const estCochee =
      optionsActuelles[optionNom] === true ||
      optionsActuelles[optionNom] === "true";
    const nouvellesOptions = { ...optionsActuelles, [optionNom]: !estCochee };

    const reservationMiseAJour = {
      ...reservationSelectionnee,
      options_json: nouvellesOptions,
    };
    setReservationSelectionnee(reservationMiseAJour);
    setReservations(
      reservations.map((r) =>
        r.id === reservationMiseAJour.id ? reservationMiseAJour : r,
      ),
    );

    await supabase
      .from("reservations")
      .update({ options_json: nouvellesOptions })
      .eq("id", reservationMiseAJour.id);
  };

  if (!estConnecte) {
    return (
      <div
        style={{
          maxWidth: "400px",
          margin: "100px auto",
          padding: "20px",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h2>Accès Direction</h2>
        <form
          onSubmit={verifierMotDePasse}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <input
            type="password"
            placeholder="Mot de passe"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            style={{
              padding: "12px",
              fontSize: "16px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "12px",
              backgroundColor: "#333",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Se connecter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          backgroundColor: "#333",
          color: "white",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px" }}>
          Panel Admin - Le California
        </h1>
        <button
          onClick={() => setEstConnecte(false)}
          style={{
            backgroundColor: "transparent",
            border: "1px solid white",
            color: "white",
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Déconnexion
        </button>
      </header>

      {chargement && reservations.length === 0 ? (
        <p>Chargement des réservations...</p>
      ) : reservationSelectionnee ? (
        <div
          style={{
            backgroundColor: "white",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <button
            onClick={() => setReservationSelectionnee(null)}
            style={{
              marginBottom: "20px",
              padding: "8px 16px",
              backgroundColor: "#eee",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ← Retour à la liste
          </button>

          <h2 style={{ marginTop: 0, color: "#333" }}>
            {reservationSelectionnee.nom_client || "Client Inconnu"}
          </h2>
          <p style={{ color: "#666", fontSize: "16px" }}>
            <strong>Chambre :</strong> {reservationSelectionnee.chambres?.nom}{" "}
            <br />
            <strong>Dates :</strong> Du {reservationSelectionnee.date_arrivee}{" "}
            au {reservationSelectionnee.date_depart}
          </p>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #eee",
              margin: "24px 0",
            }}
          />

          {/* CHANTIER 1 : OPTIONS */}
          <section style={{ marginBottom: "30px" }}>
            <h3 style={{ color: "#2196f3" }}>⚙️ Options du séjour</h3>
            <div
              style={{
                padding: "16px",
                backgroundColor: "#f9f9f9",
                borderRadius: "8px",
              }}
            >
              {optionsDisponibles.length === 0 ? (
                <p style={{ margin: 0, color: "#666", fontStyle: "italic" }}>
                  Aucune option configurée.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {optionsDisponibles.map((option) => {
                    const estCochee =
                      reservationSelectionnee.options_json &&
                      (reservationSelectionnee.options_json[option] === true ||
                        reservationSelectionnee.options_json[option] ===
                          "true");
                    return (
                      <label
                        key={option}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          backgroundColor: estCochee ? "#e3f2fd" : "white",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: estCochee
                            ? "1px solid #2196f3"
                            : "1px solid #ddd",
                          transition: "all 0.2s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={estCochee}
                          onChange={() => toggleOption(option)}
                          style={{
                            marginRight: "12px",
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: estCochee ? "bold" : "normal",
                            color: estCochee ? "#1976d2" : "#333",
                          }}
                        >
                          {option}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {chargementDetails ? (
            <p style={{ fontStyle: "italic", color: "#666" }}>
              Chargement des détails...
            </p>
          ) : (
            <>
              {/* CHANTIER 2 : MINIBAR */}
              <section style={{ marginBottom: "30px" }}>
                <h3 style={{ color: "#4caf50" }}>
                  🥤 Récapitulatif Minibar (Facturation)
                </h3>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#f9f9f9",
                    borderRadius: "8px",
                  }}
                >
                  {consosResa.length === 0 ? (
                    <p
                      style={{ margin: 0, color: "#666", fontStyle: "italic" }}
                    >
                      Aucune consommation enregistrée pour le moment.
                    </p>
                  ) : (
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "2px solid #ddd" }}>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "8px",
                              color: "#333",
                            }}
                          >
                            Produit
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "8px",
                              color: "#333",
                            }}
                          >
                            Quantité totale
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {consosResa.map((conso, index) => (
                          <tr
                            key={index}
                            style={{ borderBottom: "1px solid #eee" }}
                          >
                            <td style={{ padding: "12px 8px", color: "#444" }}>
                              {conso.nom}
                            </td>
                            <td
                              style={{
                                padding: "12px 8px",
                                textAlign: "right",
                                fontWeight: "bold",
                                fontSize: "16px",
                                color: "#4caf50",
                              }}
                            >
                              {conso.quantite}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* CHANTIER 3 : SUIVI MÉNAGE */}
              <section>
                <h3 style={{ color: "#ff9800" }}>🧹 Suivi du Ménage</h3>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#f9f9f9",
                    borderRadius: "8px",
                  }}
                >
                  {tachesResa.length === 0 ? (
                    <p
                      style={{ margin: 0, color: "#666", fontStyle: "italic" }}
                    >
                      Aucune tâche planifiée.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {tachesResa.map((tache) => (
                        <div
                          key={tache.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px",
                            backgroundColor: "white",
                            border: "1px solid #eee",
                            borderRadius: "6px",
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                display: "block",
                                color: "#333",
                                marginBottom: "4px",
                              }}
                            >
                              {tache.type_tache}
                            </strong>
                            <span style={{ fontSize: "14px", color: "#666" }}>
                              Prévu le : {tache.date_prevue}
                            </span>
                          </div>
                          <span
                            style={{
                              backgroundColor:
                                tache.statut === "A FAIRE"
                                  ? "#ffebee"
                                  : "#e8f5e9",
                              color:
                                tache.statut === "A FAIRE"
                                  ? "#f44336"
                                  : "#4caf50",
                              padding: "6px 12px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              border: `1px solid ${tache.statut === "A FAIRE" ? "#f44336" : "#4caf50"}`,
                            }}
                          >
                            {tache.statut}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <h2 style={{ fontSize: "18px", color: "#333", margin: 0 }}>
              {afficherAnciennes
                ? "Toutes les réservations"
                : "Réservations en cours et à venir"}
            </h2>
            <button
              onClick={() => setAfficherAnciennes(!afficherAnciennes)}
              style={{
                padding: "8px 12px",
                backgroundColor: afficherAnciennes ? "#666" : "#e0e0e0",
                color: afficherAnciennes ? "white" : "#333",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              {afficherAnciennes ? "Masquer l'historique" : "Voir l'historique"}
            </button>
          </div>

          {reservations.length === 0 ? (
            <p style={{ color: "#666", fontStyle: "italic" }}>
              Aucune réservation trouvée.
            </p>
          ) : (
            reservations.map((resa) => (
              <div
                key={resa.id}
                onClick={() => setReservationSelectionnee(resa)}
                style={{
                  backgroundColor: "white",
                  padding: "16px",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderLeft: "4px solid #2196f3",
                  transition: "transform 0.1s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.transform = "translateX(5px)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.transform = "translateX(0px)")
                }
              >
                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: "16px",
                      marginBottom: "4px",
                    }}
                  >
                    {resa.nom_client || "Client Inconnu"}
                  </strong>
                  <span style={{ fontSize: "14px", color: "#666" }}>
                    {resa.chambres?.nom} • Du {resa.date_arrivee} au{" "}
                    {resa.date_depart}
                  </span>
                </div>
                <div style={{ color: "#2196f3", fontWeight: "bold" }}>
                  Ouvrir →
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default Admin;
