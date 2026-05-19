# Le California - Application de Gestion Hôtelière Interne

Application de gestion interne de l'hôtel **Le California**. Cet écosystème sur mesure (ERP/PMS léger) relie en temps réel la gestion administrative de la direction (réservations, options, facturation) aux opérations de terrain exécutées par l'équipe de ménage et d'entretien via des tablettes dédiées.

L'application est entièrement synchronisée avec l'API **Lodgify** pour récupérer automatiquement les séjours, tout en intégrant un module complet de gestion manuelle pour les réservations à la journée (**Day Use**).

---

## Stack Technique

- **Frontend :** React 18 (SPA), TypeScript, Vite, React Router v6.
- **Backend & Base de données :** Supabase (PostgreSQL, Realtime, Supabase Auth).
- **Automatisation & API :** Supabase Edge Functions (Deno / TypeScript).
- **Hébergement & Déploiement :** Vercel (Frontend), Supabase (Backend/Functions).

---

## Fonctionnalités Clés et Modules

### 1. Planning et Suivi du Ménage (Vue Tablette)
Conçue spécifiquement pour une utilisation sur tablette par le personnel opérationnel sur le terrain.
- **Gestion des Onglets :** Séparation claire entre les tâches quotidiennes du calendrier et les tâches d'entretien récurrentes de l'hôtel.
- **Filtres Temporels Rétractables :** Affichage restrictif des tâches du jour même et des tâches passées restées au statut `A FAIRE` (retards), avec possibilité de déplier les arrivées futures jusqu'à J+15 pour anticiper le travail.
- **Check-lists Dynamiques par Chambre :** Les sous-tâches s'affichent sous forme de grilles réactives, triées par ordre d'exécution et adaptées au type d'intervention (*Arrivée, Intermédiaire, Départ*).
- **Calculateur de Minibar Intégré :** Un module interactif avec boutons `+` et `-` permet de consigner en temps réel les consommations du client. Chaque modification recalcule instantanément et silencieusement le montant total cumulé, mis à jour directement sur le dossier de réservation côté direction.
- **Sécurité Anti-Erreur :** Intégration de popups natives de confirmation (`window.confirm`) pour la validation globale des tâches afin d'éviter les validations accidentelles sur écran tactile.
- **Remontées d'Incidents (Notes & Commentaires) :** Zone de texte libre pour chaque tâche avec **sauvegarde automatique au focus sortant (`onBlur`)**. Permet de signaler des objets oubliés, des dégradations ou l'état général de propreté à la fermeture du clavier virtuel.

### 2. Panel Administration & Direction SÉCURISÉ
Espace d'administration centralisé pour la gouvernance de l'hôtel, protégé par **Supabase Auth**.
- **Vue Mensuelle & Calendaire :** Tri et affichage chronologique de l'ensemble des réservations du mois avec sélecteur de date fluide.
- **Coloration Dynamique des Statuts :** Attribution de badges de statut standardisés pour suivre la santé des dossiers (*Confirmée / Booked, En attente / Open, Refusée-Annulée / Cancelled*).
- **Fiche Détail Client Unifiée :** Au clic sur une réservation, un panneau exhaustif s'ouvre pour regrouper :
  - **Gestion des Options de Séjour :** Possibilité d'activer ou désactiver des prestations (ex: *Petit-déjeuner, Lit bébé*). La modification met instantanément à jour la feuille de route de la tablette via un algorithme intelligent de fusion de données.
  - **Facturation Minibar Détaillée :** Tableau comptable regroupant le libellé des produits consommés, leur prix unitaire, les quantités prélevées, les sous-totaux et le **Total Général à Facturer** au client lors du checkout.
  - **Suivi d'Avancement des Ménages :** Visualisation globale des statuts des différentes interventions planifiées tout au long du séjour du client.
  - **Commentaires de l'agent :** Un bloc rétractable avec barre de défilement (scroll) vertical compile toutes les notes saisies par le personnel sur le terrain, pré-formatées avec la date de l'intervention et le type de tâche.

### 3. Module "Day Use" (Gestion des réservations à la journée)
Système indépendant de Lodgify, créé pour la commercialisation des suites en journée ou demi-journée.
- **Calendrier Visuel Dédié :** Interface séparée accessible depuis l'administration sous la route `/day-use` pour bloquer des créneaux horaires spécifiques (*Matin, Après-midi ou Journée entière*).
- **Formulaire de Réservation Manuelle :** Saisie rapide des métadonnées critiques : Suite cible, période, identité du client, coordonnées de contact, prix personnalisé facturé, options complémentaires et notes administratives.
- **Architecture Unifiée en Cascade :** Lors de l'enregistrement d'un Day Use, l'application exécute un scénario complexe en arrière-plan :
  1. Génération d'une entrée factice sécurisée dans la table `reservations` (avec un identifiant préfixé `dayuse-timestamp`) pour l'unifier au grand livre comptable de l'hôtel.
  2. Création de la fiche d'activité dans la table `day_use`.
  3. Génération instantanée d'une tâche de ménage dédiée (`Ménage Day Use`) sur la tablette des agents avec une check-list complète de 50 étapes extraite automatiquement des modèles configurés en base de données.
- **Nettoyage Automatisé :** Le bouton de suppression du calendrier Day Use déclenche un nettoyage chirurgical en cascade (supprime le Day Use, la fausse réservation associée, la tâche de ménage et l'ensemble de ses sous-tâches d'exécution).

### 4. Système d'Archivage
- **Nettoyage de Vue Global :** Un bouton d'archivage rapide est disponible sur chaque ligne de réservation et dans les fiches détaillées.
- **Traitement de Clôture :** Archiver un dossier bascule son état en base (`est_archive = TRUE`), le retire instantanément des tableaux de bord actifs, et **clôture automatiquement toutes les tâches de ménage associées restées en suspens** (passage du statut à `TERMINÉ`), évitant ainsi l'encombrement des tablettes de l'équipe de ménage.
- **Consultation Historique :** Un onglet d'archives permet de basculer sur l'historique complet pour consulter les anciennes consommations et remarques à tout moment.

---

## Structure de la Base de Données (Supabase / PostgreSQL)

L'application repose sur un modèle relationnel robuste articulé autour des tables suivantes :
- `chambres` : Inventaire physique des suites de l'hôtel avec correspondances des IDs Lodgify.
- `reservations` : Registre centralisé des séjours (Lodgify et Day Use), incluant les totaux financiers du minibar (`conso_minibar`) et le statut d'archivage (`est_archive`).
- `day_use` : Table d'extension mémorisant les détails spécifiques des clients à la journée.
- `taches` : Planification des interventions de nettoyage et de contrôle technique.
- `tache_items_execution` : Lignes individuelles composant la check-list de chaque tâche, enregistrant l'état coché (`est_fait`) et l'horodatage précis de réalisation (`fait_a`).
- `checklist_modeles` : Modèles de référence des consignes de nettoyage standards de l'hôtel.
- `checklist_options` : Modèles de consignes conditionnelles déclenchées par les options sélectionnées.
- `minibar_produits` & `minibar_consommations` : Catalogue tarifaire et journal des prélèvements de boissons/snacks.

---

## Synchronisation Automatique par "Diff/Merge" (Edge Function)

Le rafraîchissement des données s'appuie sur une **Supabase Edge Function** (`sync-lodgify`) programmée pour s'exécuter périodiquement à intervalles réguliers.

### Comportement Intelligent (Algorithme "Anti-Écrasement") :
1. **Fenêtre Glissante :** Le script récupère les réservations Lodgify sur un horizon allant de **J-10 au passé jusqu'à J+90 dans le futur**.
2. **Upsert Non-Destructif :** Les réservations sont mises à jour sans jamais écraser les données locales saisies manuellement (comme les consommations minibar ou les statuts de ménage validés).
3. **Calcul de Diff sur les Checklists :** Au lieu de vider et recréer les lignes de check-list (ce qui ferait perdre l'état d'avancement des femmes de chambre), la fonction compare le modèle théorique et l'état actuel de la base :
   - Si une consigne a été ajoutée ou une option activée, elle insère la nouvelle ligne en fin de liste.
   - Si une option a été désactivée, elle retire chirurgicalement la ligne obsolète.
   - **Toutes les autres cases déjà cochées restent cochées et intactes.**

---

## Configuration du Déploiement Production (SPA React)

Pour éviter les erreurs classiques de serveurs statiques lors du rafraîchissement des pages en production sur des sous-routes comme `/admin` ou `/day-use` (Erreurs `404 NOT FOUND` de Vercel), le projet intègre à sa racine un fichier de configuration de réécriture d'URL dédié :

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

Ce fichier force le serveur de Vercel à rediriger toutes les requêtes d'URL inconnues vers l'originel `index.html`, passant ainsi la main au routeur interne de React (`React Router`) pour charger le bon écran sans coupure.

---

## Commandes Utiles au Développement

### Lancement Local du Frontend
```bash
npm install
npm run dev
```

### Déploiement de la Edge Function Supabase
```bash
supabase functions deploy sync-lodgify
```
