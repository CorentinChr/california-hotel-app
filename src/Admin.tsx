import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

// --- TYPAGES ---
interface Reservation {
  id: string;
  nom_client: string;
  date_arrivee: string;
  date_depart: string;
  chambres: { nom: string };
  options_json: Record<string, any>;
  statut: string;
  conso_minibar: number; // <-- NOUVEAU
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
  prix: number; // <-- NOUVEAU
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

function Admin() {
  const navigate = useNavigate();

  // --- COULEURS CHARTE GRAPHIQUE ---
  const BLEU_CALIFORNIA = "#009CD8";
  const ORANGE_CALIFORNIA = "#E95219";

  // --- ÉTATS D'AUTHENTIFICATION ---
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [estConnecte, setEstConnecte] = useState(false);

  // --- ÉTATS DES DONNÉES ---
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [chargement, setChargement] = useState(false);
  const [reservationSelectionnee, setReservationSelectionnee] =
    useState<Reservation | null>(null);

  const [moisActuel, setMoisActuel] = useState(new Date().getMonth());
  const [anneeActuelle, setAnneeActuelle] = useState(new Date().getFullYear());

  const [optionsDisponibles, setOptionsDisponibles] = useState<string[]>([]);

  const [tachesResa, setTachesResa] = useState<TacheInfo[]>([]);
  const [consosResa, setConsosResa] = useState<ConsoAgregee[]>([]);
  const [chargementDetails, setChargementDetails] = useState(false);

  // --- GESTION DE LA SESSION SUPABASE ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setEstConnecte(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEstConnecte(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- CHARGEMENT DES DONNÉES ---
  useEffect(() => {
    if (estConnecte) {
      chargerReservations();
      chargerOptions();
    }
  }, [estConnecte, moisActuel, anneeActuelle]);

  useEffect(() => {
    if (reservationSelectionnee) {
      chargerDetailsReservation(reservationSelectionnee.id);
    }
  }, [reservationSelectionnee?.id]);

  // --- FONCTIONS AUTHENTIFICATION ---
  const verifierMotDePasse = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) {
      alert("Email ou mot de passe incorrect.");
    } else {
      setEstConnecte(true);
      setEmail("");
      setMotDePasse("");
    }
  };

  const seDeconnecter = async () => {
    await supabase.auth.signOut();
    setEstConnecte(false);
    setReservationSelectionnee(null);
  };

  // --- FONCTIONS NAVIGATION MOIS ---
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

  const formaterDate = (dateString: string) => {
    const [annee, mois, jour] = dateString.split("-");
    return `${jour}/${mois}/${annee}`;
  };

  // --- FONCTION POUR LES BADGES DE STATUT ---
  const getBadgeStatut = (statut: string) => {
    let bgColor = "#e0e0e0";
    let color = "#333";
    let label = statut;

    if (statut === "Booked") {
      bgColor = "#e8f5e9";
      color = "#4caf50";
      label = "Confirmée";
    } else if (statut === "Declined" || statut === "Cancelled") {
      bgColor = "#ffebee";
      color = "#f44336";
      label = "Refusée / Annulée";
    } else if (statut === "Open") {
      bgColor = "#fff3e0";
      color = "#ff9800";
      label = "En attente";
    }

    return (
      <span
        style={{
          backgroundColor: bgColor,
          color: color,
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "bold",
          border: `1px solid ${color}`,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  };

  // --- FONCTIONS DONNÉES ---
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

    const pad = (n: number) => n.toString().padStart(2, "0");
    const premierJour = `${anneeActuelle}-${pad(moisActuel + 1)}-01`;
    const nbJoursDansMois = new Date(
      anneeActuelle,
      moisActuel + 1,
      0,
    ).getDate();
    const dernierJour = `${anneeActuelle}-${pad(moisActuel + 1)}-${pad(nbJoursDansMois)}`;

    const { data, error } = await supabase
      .from("reservations")
      .select(
        `id, nom_client, date_arrivee, date_depart, statut, options_json, conso_minibar, chambres ( nom )`, // <-- AJOUT conso_minibar
      )
      .lte("date_arrivee", dernierJour)
      .gte("date_depart", premierJour)
      .order("date_arrivee", { ascending: true });

    if (!error && data) {
      setReservations(data as unknown as Reservation[]);
      if (reservationSelectionnee) {
        const resaAJour = data.find((r) => r.id === reservationSelectionnee.id);
        if (resaAJour)
          setReservationSelectionnee(resaAJour as unknown as Reservation);
      }
    }
    setChargement(false);
  };

  const chargerDetailsReservation = async (reservationId: string) => {
    setChargementDetails(true);
    const { data: tachesData } = await supabase
      .from("taches")
      .select("id, date_prevue, type_tache, statut")
      .eq("reservation_id", reservationId)
      .order("date_prevue", { ascending: true });

    if (tachesData) {
      setTachesResa(tachesData);
      const tacheIds = tachesData.map((t) => t.id);

      if (tacheIds.length > 0) {
        const { data: consosData } = await supabase
          .from("minibar_consommations")
          .select("quantite, minibar_produits(nom, prix)") // <-- AJOUT DU PRIX
          .in("tache_id", tacheIds);

        if (consosData) {
          const recapitulatif: Record<string, ConsoAgregee> = {};
          consosData.forEach((conso: any) => {
            const nomProduit = conso.minibar_produits?.nom || "Produit inconnu";
            const prixProduit = conso.minibar_produits?.prix || 0; // <-- AJOUT DU PRIX

            if (!recapitulatif[nomProduit])
              recapitulatif[nomProduit] = {
                nom: nomProduit,
                quantite: 0,
                prix: prixProduit,
              }; // <-- AJOUT DU PRIX

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

  // --- RENDU : NON CONNECTÉ ---
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
        <h2>Accès Direction SÉCURISÉ</h2>
        <form
          onSubmit={verifierMotDePasse}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <input
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: "12px",
              fontSize: "16px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
            required
          />
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
            required
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
        <button
          onClick={() => navigate("/")}
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "transparent",
            color: "#666",
            border: "1px solid #ccc",
            borderRadius: "6px",
            cursor: "pointer",
            width: "100%",
          }}
        >
          ← Retour à la tablette
        </button>
      </div>
    );
  }

  // --- RENDU : CONNECTÉ ---
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
          backgroundColor: "#333",
          color: "white",
          padding: "16px 24px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "22px" }}>⚙️ Panel Admin</h1>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              backgroundColor: BLEU_CALIFORNIA,
              border: "none",
              color: "white",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            🧹 Tablette
          </button>
          <button
            onClick={seDeconnecter}
            style={{
              backgroundColor: "transparent",
              border: "1px solid white",
              color: "white",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* GESTION DE LA VUE : DÉTAILS OU LISTE */}
      {chargement && reservations.length === 0 ? (
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
      ) : reservationSelectionnee ? (
        // --- VUE DÉTAIL ---
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
            ← Retour à la liste du mois
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, color: "#333" }}>
              {reservationSelectionnee.nom_client || "Client Inconnu"}
            </h2>
            {getBadgeStatut(reservationSelectionnee.statut)}
          </div>

          <p style={{ color: "#666", fontSize: "16px", marginTop: "8px" }}>
            <strong>Chambre :</strong> {reservationSelectionnee.chambres?.nom}{" "}
            <br />
            <strong>Dates :</strong> Du{" "}
            {formaterDate(reservationSelectionnee.date_arrivee)} au{" "}
            {formaterDate(reservationSelectionnee.date_depart)}
          </p>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #eee",
              margin: "24px 0",
            }}
          />

          {/* CHANTIER 1 : OPTIONS (Condensées) */}
          <section style={{ marginBottom: "30px" }}>
            <h3 style={{ color: BLEU_CALIFORNIA }}>⚙️ Options du séjour</h3>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
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
                          backgroundColor: estCochee ? "#e1f5fe" : "white",
                          padding: "10px 16px",
                          borderRadius: "20px",
                          border: estCochee
                            ? `2px solid ${BLEU_CALIFORNIA}`
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
                            fontSize: "15px",
                            fontWeight: estCochee ? "bold" : "normal",
                            color: estCochee ? BLEU_CALIFORNIA : "#333",
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
                      Aucune consommation enregistrée.
                    </p>
                  ) : (
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "2px solid #ddd",
                            fontSize: "14px",
                          }}
                        >
                          <th
                            style={{
                              textAlign: "left",
                              padding: "8px",
                              color: "#666",
                            }}
                          >
                            Produit
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "8px",
                              color: "#666",
                            }}
                          >
                            Prix U.
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "8px",
                              color: "#666",
                            }}
                          >
                            Qté
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "8px",
                              color: "#666",
                            }}
                          >
                            Sous-total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {consosResa.map((conso, index) => (
                          <tr
                            key={index}
                            style={{ borderBottom: "1px solid #eee" }}
                          >
                            <td
                              style={{
                                padding: "12px 8px",
                                color: "#444",
                                fontWeight: "bold",
                              }}
                            >
                              {conso.nom}
                            </td>
                            <td
                              style={{
                                padding: "12px 8px",
                                textAlign: "center",
                                color: "#888",
                              }}
                            >
                              {conso.prix.toFixed(2)} €
                            </td>
                            <td
                              style={{
                                padding: "12px 8px",
                                textAlign: "center",
                                fontWeight: "bold",
                                color: BLEU_CALIFORNIA,
                              }}
                            >
                              x {conso.quantite}
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
                              {(conso.quantite * conso.prix).toFixed(2)} €
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: "#e8f5e9" }}>
                          <td
                            colSpan={3}
                            style={{
                              padding: "16px 8px",
                              textAlign: "right",
                              fontWeight: "bold",
                              color: "#333",
                              fontSize: "16px",
                            }}
                          >
                            TOTAL À FACTURER :
                          </td>
                          <td
                            style={{
                              padding: "16px 8px",
                              textAlign: "right",
                              fontWeight: "bold",
                              fontSize: "20px",
                              color: "#4caf50",
                            }}
                          >
                            {reservationSelectionnee.conso_minibar?.toFixed(
                              2,
                            ) || "0.00"}{" "}
                            €
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </section>

              {/* CHANTIER 3 : SUIVI MÉNAGE (Condensé) */}
              <section>
                <h3 style={{ color: ORANGE_CALIFORNIA }}>🧹 Suivi du Ménage</h3>
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
                        flexWrap: "wrap",
                        gap: "10px",
                      }}
                    >
                      {tachesResa.map((tache) => (
                        <div
                          key={tache.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px 16px",
                            backgroundColor: "white",
                            border: `1px solid ${tache.statut === "A FAIRE" ? "#f44336" : "#4caf50"}`,
                            borderRadius: "20px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          }}
                        >
                          <strong style={{ color: "#333", fontSize: "15px" }}>
                            {tache.type_tache}
                          </strong>
                          <span style={{ fontSize: "13px", color: "#666" }}>
                            ({formaterDate(tache.date_prevue)})
                          </span>
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
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: "bold",
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
        // --- VUE LISTE AVEC SÉLECTEUR DE MOIS ---
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "20px",
              marginBottom: "8px",
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

          {reservations.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                backgroundColor: "white",
                borderRadius: "12px",
                border: "2px dashed #ccc",
              }}
            >
              <p style={{ color: "#666", fontSize: "16px", margin: 0 }}>
                Aucune réservation trouvée pour ce mois.
              </p>
            </div>
          ) : (
            reservations.map((resa) => {
              const estAnnulee =
                resa.statut === "Declined" || resa.statut === "Cancelled";

              return (
                <div
                  key={resa.id}
                  onClick={() => setReservationSelectionnee(resa)}
                  style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "10px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderLeft: `5px solid ${estAnnulee ? "#f44336" : BLEU_CALIFORNIA}`,
                    opacity: estAnnulee ? 0.6 : 1,
                    transition: "transform 0.1s, box-shadow 0.1s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = "translateX(5px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(0,0,0,0.1)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = "translateX(0px)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 6px rgba(0,0,0,0.05)";
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      <strong style={{ fontSize: "18px", color: "#333" }}>
                        {resa.nom_client || "Client Inconnu"}
                      </strong>
                      {getBadgeStatut(resa.statut)}
                    </div>
                    <span style={{ fontSize: "15px", color: "#666" }}>
                      <strong>{resa.chambres?.nom}</strong> • Du{" "}
                      {formaterDate(resa.date_arrivee)} au{" "}
                      {formaterDate(resa.date_depart)}
                    </span>
                  </div>
                  <div
                    style={{
                      color: estAnnulee ? "#f44336" : BLEU_CALIFORNIA,
                      fontWeight: "bold",
                      padding: "8px 16px",
                      backgroundColor: estAnnulee ? "#ffebee" : "#f0f8ff",
                      borderRadius: "6px",
                    }}
                  >
                    Gérer →
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default Admin;
