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
}
interface MinibarConsommation {
  id: string;
  produit_id: string;
  quantite: number;
}

interface Tache {
  id: string;
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

  // États pour les fenêtres dépliantes
  const [tacheDepliee, setTacheDepliee] = useState<string | null>(null);
  const [chambreDepliee, setChambreDepliee] = useState<string | null>(null);

  const aujourdhui = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function fetchData() {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const ilYa10Jours = pastDate.toISOString().split("T")[0];

      const { data: tachesData } = await supabase
        .from("taches")
        .select(
          `id, date_prevue, type_tache, statut, reservations ( nom_client ), chambres ( nom ), tache_items_execution ( id, libelle, ordre, est_fait ), minibar_consommations ( id, produit_id, quantite )`,
        )
        .or(
          `date_prevue.eq.${aujourdhui},and(date_prevue.gte.${ilYa10Jours},date_prevue.lt.${aujourdhui},statut.eq."A FAIRE")`,
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
        bg: "#f44336",
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

  return (
    <div
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "16px",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          backgroundColor: "#2196f3",
          color: "white",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px" }}>Ménage</h1>
        <button
          onClick={() => navigate("/admin")}
          style={{
            backgroundColor: "rgba(255,255,255,0.2)",
            border: "none",
            color: "white",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          ⚙️ Admin
        </button>
      </header>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <button
          onClick={() => setOngletActif("QUOTIDIEN")}
          style={{
            flex: 1,
            padding: "12px",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "0.2s",
            backgroundColor: ongletActif === "QUOTIDIEN" ? "#333" : "white",
            color: ongletActif === "QUOTIDIEN" ? "white" : "#666",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          📅 Réservations
        </button>
        <button
          onClick={() => setOngletActif("RECURRENTES")}
          style={{
            flex: 1,
            padding: "12px",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "0.2s",
            backgroundColor: ongletActif === "RECURRENTES" ? "#333" : "white",
            color: ongletActif === "RECURRENTES" ? "white" : "#666",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          ✨ Entretien Profond
        </button>
      </div>

      {chargement ? (
        <p>Chargement des données...</p>
      ) : ongletActif === "QUOTIDIEN" ? (
        /* ONGLET 1 : TÂCHES QUOTIDIENNES */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {taches.length === 0 ? (
            <p style={{ color: "#666", fontStyle: "italic" }}>
              Aucune tâche de réservation en attente.
            </p>
          ) : (
            taches.map((tache) => (
              <div
                key={tache.id}
                style={{
                  backgroundColor: "white",
                  padding: "16px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  borderLeft:
                    tache.date_prevue !== aujourdhui &&
                    tache.statut === "A FAIRE"
                      ? "4px solid #f44336"
                      : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        fontSize: "16px",
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      {tache.chambres?.nom} – {tache.type_tache}
                    </strong>
                    {tache.date_prevue !== aujourdhui && (
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#f44336",
                          fontWeight: "bold",
                        }}
                      >
                        ⚠️ Prévu le : {tache.date_prevue}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor:
                          tache.statut === "A FAIRE" ? "#f44336" : "#4caf50",
                        color: "white",
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    >
                      {tache.statut}
                    </span>
                    {tache.statut === "A FAIRE" && (
                      <button
                        onClick={() => marquerCommeTerminee(tache.id)}
                        style={{
                          padding: "6px 10px",
                          backgroundColor: "#4caf50",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        ✓ Terminer
                      </button>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "12px",
                  }}
                >
                  Client : {tache.reservations?.nom_client || "Non renseigné"}
                </div>
                <button
                  onClick={() =>
                    setTacheDepliee(tacheDepliee === tache.id ? null : tache.id)
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor:
                      tacheDepliee === tache.id ? "#e0e0e0" : "#2196f3",
                    color: tacheDepliee === tache.id ? "#333" : "white",
                    border: "none",
                    borderRadius: "99px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {tacheDepliee === tache.id
                    ? "▲ Fermer la Check-list"
                    : "▼ Ouvrir la Check-list"}
                </button>

                {tacheDepliee === tache.id && (
                  <div
                    style={{
                      marginTop: "16px",
                      paddingTop: "16px",
                      borderTop: "1px solid #eee",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 12px 0",
                        fontSize: "14px",
                        color: "#333",
                      }}
                    >
                      À vérifier absolument :
                    </h4>
                    {tache.tache_items_execution
                      .sort((a, b) => a.ordre - b.ordre)
                      .map((item) => (
                        <label
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8px 0",
                            cursor: "pointer",
                            opacity: item.est_fait ? 0.5 : 1,
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
                              marginRight: "12px",
                              width: "18px",
                              height: "18px",
                              cursor: "pointer",
                            }}
                          />
                          <span style={{ fontSize: "14px", color: "#444" }}>
                            {item.libelle}
                          </span>
                        </label>
                      ))}
                    {(tache.type_tache === "Départ" ||
                      tache.type_tache === "Intermédiaire") && (
                      <div
                        style={{
                          marginTop: "24px",
                          paddingTop: "16px",
                          borderTop: "1px dashed #ccc",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 12px 0",
                            fontSize: "14px",
                            color: "#333",
                          }}
                        >
                          🥤 Consommations Minibar :
                        </h4>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
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
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                }}
                              >
                                <span
                                  style={{ fontSize: "14px", color: "#555" }}
                                >
                                  {produit.nom}
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <button
                                    onClick={() =>
                                      modifierConso(tache.id, produit.id, -1)
                                    }
                                    disabled={quantite === 0}
                                    style={{
                                      width: "28px",
                                      height: "28px",
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
                                    }}
                                  >
                                    -
                                  </button>
                                  <span
                                    style={{
                                      width: "20px",
                                      textAlign: "center",
                                      fontWeight: "bold",
                                      fontSize: "14px",
                                    }}
                                  >
                                    {quantite}
                                  </span>
                                  <button
                                    onClick={() =>
                                      modifierConso(tache.id, produit.id, 1)
                                    }
                                    style={{
                                      width: "28px",
                                      height: "28px",
                                      borderRadius: "50%",
                                      border: "none",
                                      backgroundColor: "#2196f3",
                                      color: "white",
                                      cursor: "pointer",
                                      fontWeight: "bold",
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
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* ONGLET 2 : TÂCHES RÉCURRENTES (ACCORDÉON) */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#666",
              textAlign: "center",
              marginBottom: "8px",
            }}
          >
            Cliquez sur une chambre pour voir les tâches d'entretien.
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
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                >
                  {/* En-tête CLICQUABLE */}
                  <div
                    onClick={() =>
                      setChambreDepliee(estDepliee ? null : nomChambre)
                    }
                    style={{
                      backgroundColor: estDepliee ? "#e3f2fd" : "white",
                      padding: "16px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: estDepliee ? "1px solid #bbdefb" : "none",
                      transition: "background-color 0.2s",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: "#1976d2",
                        fontSize: "16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      🛏️ {nomChambre}
                      {nbUrgentes > 0 && (
                        <span
                          style={{
                            backgroundColor: "#f44336",
                            color: "white",
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                          }}
                        >
                          {nbUrgentes} prioritaire{nbUrgentes > 1 ? "s" : ""}
                        </span>
                      )}
                    </h3>
                    <span
                      style={{
                        color: "#1976d2",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      {estDepliee ? "▲ FERMER" : "▼ OUVRIR"}
                    </span>
                  </div>

                  {/* Liste des tâches DÉPLIANTE */}
                  {estDepliee && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {tachesChambre
                        .sort((a, b) => {
                          const tDiffA =
                            new Date(aujourdhui).getTime() -
                            new Date(a.derniere_execution).getTime();
                          const tDiffB =
                            new Date(aujourdhui).getTime() -
                            new Date(b.derniere_execution).getTime();
                          const restA =
                            a.frequence_jours -
                            Math.floor(tDiffA / (1000 * 3600 * 24));
                          const restB =
                            b.frequence_jours -
                            Math.floor(tDiffB / (1000 * 3600 * 24));
                          return restA - restB;
                        })
                        .map((tache, index) => {
                          const statut = calculerStatutDelai(
                            tache.derniere_execution,
                            tache.frequence_jours,
                          );

                          return (
                            <div
                              key={tache.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "16px",
                                borderBottom:
                                  index < tachesChambre.length - 1
                                    ? "1px solid #eee"
                                    : "none",
                              }}
                            >
                              <div style={{ flex: 1, paddingRight: "16px" }}>
                                <span
                                  style={{
                                    fontSize: "14px",
                                    color: "#333",
                                    display: "block",
                                    marginBottom: "6px",
                                  }}
                                >
                                  {tache.libelle}
                                </span>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    padding: "4px 8px",
                                    borderRadius: "12px",
                                    backgroundColor: statut.bg,
                                    color: statut.couleur,
                                  }}
                                >
                                  {statut.texte}
                                </span>
                              </div>

                              <button
                                onClick={() => validerTacheRecurrente(tache.id)}
                                style={{
                                  padding: "8px 12px",
                                  backgroundColor: "#f5f5f5",
                                  color: "#333",
                                  border: "1px solid #ccc",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: "bold",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ✔ Fait
                              </button>
                            </div>
                          );
                        })}

                      {/* NOUVEAU : BOUTON FERMER EN BAS DE CARTE */}
                      <button
                        onClick={() => setChambreDepliee(null)}
                        style={{
                          padding: "12px",
                          backgroundColor: "#f5f5f5",
                          color: "#1976d2",
                          border: "none",
                          borderTop: "1px solid #eee",
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "13px",
                          textAlign: "center",
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
