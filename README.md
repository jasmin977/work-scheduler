# Planning hebdomadaire des employés

Application monopage sans dépendances pour les managers : tapez les horaires des employés, visualisez instantanément le planning hebdomadaire, puis imprimez-le ou téléchargez-le en image PNG haute résolution.

## Lancer l'application

Ouvrez [index.html](index.html) dans un navigateur moderne. Aucun build, aucun serveur, aucune connexion internet requise. Les données sont enregistrées automatiquement dans le navigateur (localStorage). Le planning est générique (Lundi → Dimanche), sans dates : il reste valable semaine après semaine.

## Utilisation

1. **Ajouter des employés** — tapez un nom dans le champ sous la grille de saisie et appuyez sur Entrée. Glissez la poignée `⠿` pour réorganiser les lignes.
   Dans la grille, naviguez au clavier : **← →** changent de jour (en bout de semaine, on passe à l'employé suivant/précédent), **↑ ↓** changent d'employé, **Entrée** descend d'une ligne. En cours d'édition, ← → déplacent d'abord le curseur dans la cellule et ne changent de cellule qu'en bout de texte.
2. **Tapez les horaires** directement dans la grille. Le planning visuel se met à jour à chaque frappe — il n'y a pas de bouton Enregistrer.

   | Vous tapez | Signification |
   |---|---|
   | `7-5` | 7h00 → 17h00 |
   | `7-1 5-9` | service coupé : 7h → 13h puis 17h → 21h |
   | `7:30-12:30` | précision à la demi-heure, positionnée exactement sur la grille |
   | `9-17` ou `9am-5pm` | le format 24 h ou am/pm explicite fonctionne aussi |
   | `OFF`, `repos`, `congé` | jour de repos (bande hachurée sur toute la ligne) |

   Le matin/après-midi est déduit automatiquement : chaque heure est résolue vers le créneau plausible le plus tôt dans la plage de la grille, et chaque service doit commencer après la fin du précédent (donc `5-9` après `7-1` signifie 17h–21h). Une cellule illisible devient rouge.
3. **Imprimer** — le bouton 🖨 produit une mise en page propre : sans contrôles, pleine largeur, nom du commerce, les sept jours, sauts de page entre les jours. L'orientation (portrait ou paysage) se choisit librement dans la boîte de dialogue d'impression — le paysage reste conseillé pour une grille horaire plus lisible.
4. **Télécharger en image** — un moteur de rendu canvas intégré (aucune bibliothèque externe, fonctionne hors ligne) génère un PNG haute résolution (2×) de la semaine complète, avec le nom du commerce en en-tête. Chaque jour peut aussi être téléchargé séparément depuis son menu `⋯`.

## Plusieurs commerces

Le sélecteur **Commerce** dans la barre d'outils permet de gérer plusieurs plannings indépendants :

- **Changer de commerce** : choisissez-le dans la liste déroulante — employés, horaires et plage de grille sont propres à chaque commerce.
- **＋** crée un nouveau commerce vide (le champ du nom est sélectionné automatiquement pour le renommer aussitôt).
- Le menu **⋯** propose « Supprimer ce commerce » (avec confirmation ; l'option n'apparaît que s'il reste plus d'un commerce).
- Renommer le commerce via le champ en haut à gauche met à jour la liste en direct.

## Fonctionnalités

- **Bandeau d'effectif** sous chaque jour : nombre d'employés présents par heure, avec code couleur (orange = 1 seule personne, vert = bien couvert, `–` = personne).
- **Récapitulatif hebdomadaire** : heures, jours travaillés et jours OFF par employé, plus les totaux.
- **Actions rapides** (menus `⋯` / `▾`) : copier un jour vers n'importe quel autre jour, vider un jour, copier/coller la semaine d'un employé, vider un employé, télécharger un jour en PNG.
- **Plage horaire configurable** (par défaut 7h → 22h) via les sélecteurs de la barre d'outils.
- **Vue journée agrandie** : le bouton `⤢` d'une carte jour affiche ce jour en grand.
- **Responsive** : les plannings défilent horizontalement avec la colonne des noms figée ; sous 760 px, l'application affiche un jour à la fois avec une barre d'onglets Lun–Dim.

## Fichiers

- [index.html](index.html) — structure de la page
- [styles.css](styles.css) — tous les styles, y compris la mise en page d'impression (`@media print`)
- [app.js](app.js) — état, analyseur d'horaires, rendu, export PNG canvas
