# Le California - Système de Gestion Ménage & Admin

Application web full-stack dédiée à la gestion du personnel d'entretien et au suivi administratif de l'hôtel **Le California**. L'application synchronise automatiquement les réservations depuis **Lodgify** et génère des plannings de ménage intelligents.

## Fonctionnalités

### Interface Ménage (Tablette)

- **Planning Quotidien** : Vue claire des Arrivées, Départs et Ménages Intermédiaires du jour.
- **Check-list Dynamique** : Sous-tâches générées automatiquement selon le type de ménage et les options clients.
- **Suivi Minibar** : Compteur tactile pour enregistrer les consommations en temps réel.
- **Entretien Profond** : Gestion des tâches récurrentes (30, 90, 180 jours) groupées par chambre et par fréquence.
- **Anticipation** : Possibilité de voir et préparer les arrivées des 15 prochains jours en avance.

### Panel Administration

- **Sécurisé** : Accès protégé par authentification Supabase Auth.
- **Vue Calendrier** : Navigation par mois avec tri chronologique des réservations.
- **Gestion des Options** : Activation/Désactivation d'options (ex: Petit-déjeuner) impactant directement les check-lists du ménage.
- **Facturation** : Récapitulatif consolidé des consommations minibar par séjour.
- **Statuts Lodgify** : Affichage visuel des statuts (Confirmé, Annulé, En attente).

## Stack Technique

- **Frontend** : React.js (Vite + TypeScript)
- **Style** : CSS-in-JS (Inline styles pour une portabilité maximale)
- **Backend** : Supabase
  - **Database** : PostgreSQL (Tables : reservations, taches, chambres, minibar...)
  - **Edge Functions** : Script Deno pour la synchronisation API Lodgify.
  - **Cron Jobs** : Extension `pg_cron` pour une synchronisation automatique toutes les 15 minutes.
- **Déploiement** : Vercel

## Configuration & Installation

1. **Cloner le projet**
   ```bash
   git clone [url-du-repo]
   cd le-california
   ```
