import "server-only";
import { db } from "@/lib/db";
import { scoreToStars } from "@/lib/rating";
import { editionLabel, omnibusLabel } from "@/lib/editions";
import { scopeLabel } from "@/lib/goals";
import { toCsv, type CsvColumn } from "./csv";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  type CsvEntity,
  type ExportedDocument,
} from "./shape";

/** Lecture par pages : on ne charge jamais un journal entier en mémoire. */
const PAGE = 500;

/**
 * Export complet des données d'un utilisateur (I4, N9).
 *
 * Le périmètre est volontairement personnel : le suivi de l'utilisateur, plus
 * les fiches d'œuvres qu'il référence — sans ce dictionnaire, le fichier
 * serait illisible. Le catalogue entier relève de la sauvegarde (I5).
 */
export async function collectUserExport(
  userId: string,
): Promise<ExportedDocument> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const [
    userWorks,
    entries,
    userSeasons,
    watches,
    tomes,
    reading,
    imports,
    lists,
    tags,
    favorites,
    quotes,
    goals,
    follows,
    socialLikes,
    comments,
    blocks,
  ] = await Promise.all([
    db.userWork.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.journalEntry.findMany({
      where: { userId },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }],
      include: {
        season: { select: { number: true } },
        episode: {
          select: { number: true, season: { select: { number: true } } },
        },
        tome: { select: { number: true } },
      },
    }),
    db.userSeason.findMany({
      where: { userId },
      include: {
        season: {
          select: { number: true, workId: true },
        },
      },
    }),
    db.episodeWatch.findMany({
      where: { userId },
      include: {
        episode: {
          select: {
            number: true,
            season: { select: { number: true, workId: true } },
          },
        },
      },
    }),
    db.tomeProgress.findMany({
      where: { userId },
      include: { tome: { select: { number: true, workId: true } } },
    }),
    db.readingProgress.findMany({
      where: { userId },
      orderBy: { recordedAt: "asc" },
    }),
    db.importBatch.findMany({
      where: { userId },
      select: {
        id: true,
        source: true,
        status: true,
        createdAt: true,
        files: { select: { name: true, checksum: true, bytes: true } },
      },
    }),
    db.list.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    }),
    db.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        works: { select: { workId: true } },
        entries: {
          select: {
            entry: { select: { workId: true, loggedAt: true } },
          },
        },
      },
    }),
    db.favorite.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    }),
    db.quote.findMany({
      where: { userId },
      orderBy: [{ workId: "asc" }, { page: "asc" }, { createdAt: "asc" }],
      include: {
        tome: { select: { number: true } },
        edition: { select: { publisher: true, format: true, isbn: true } },
      },
    }),
    db.goal.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { scope: "asc" }],
    }),
    // ── Social (lot 4) ────────────────────────────────────────
    // Les gestes de l'utilisateur, jamais ceux qu'il a reçus : les
    // notifications sont dérivées de l'activité d'autrui, et les signalements
    // parlent d'un tiers. Ni l'un ni l'autre n'est « sa » donnée au sens de N4.
    db.follow.findMany({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
      orderBy: { createdAt: "asc" },
      include: {
        follower: { select: { username: true, name: true } },
        following: { select: { username: true, name: true } },
      },
    }),
    db.socialLike.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        journalEntry: {
          select: { workId: true, user: { select: { username: true } } },
        },
        list: {
          select: { title: true, user: { select: { username: true } } },
        },
        userWork: {
          select: { workId: true, user: { select: { username: true } } },
        },
      },
    }),
    db.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      include: {
        journalEntry: {
          select: { workId: true, user: { select: { username: true } } },
        },
        list: {
          select: { title: true, user: { select: { username: true } } },
        },
        userWork: {
          select: { workId: true, user: { select: { username: true } } },
        },
      },
    }),
    db.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "asc" },
      include: { blocked: { select: { username: true, name: true } } },
    }),
  ]);

  // Toutes les œuvres référencées, quelle que soit la voie. Une œuvre présente
  // dans une seule liste doit figurer au dictionnaire, sinon la ligne CSV
  // correspondante sortirait sans titre.
  const workIds = new Set<string>([
    ...userWorks.map((u) => u.workId),
    ...entries.map((e) => e.workId),
    ...reading.map((r) => r.workId),
    ...userSeasons.map((s) => s.season.workId),
    ...watches.map((w) => w.episode.season.workId),
    ...tomes.map((t) => t.tome.workId),
    ...lists.flatMap((l) => l.items.map((i) => i.workId)),
    ...tags.flatMap((t) => t.works.map((w) => w.workId)),
    ...favorites.map((f) => f.workId),
    ...quotes.map((q) => q.workId),
    // Les œuvres qu'on a aimées ou commentées chez d'autres : sans elles, la
    // ligne d'export sortirait sans titre.
    ...socialLikes.flatMap((l) =>
      [l.journalEntry?.workId, l.userWork?.workId].filter(
        (id): id is string => !!id,
      ),
    ),
    ...comments.flatMap((c) =>
      [c.journalEntry?.workId, c.userWork?.workId].filter(
        (id): id is string => !!id,
      ),
    ),
  ]);

  const works = await collectWorks([...workIds]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
      visibility: user.visibility,
      showJournalPublicly: user.showJournalPublicly,
      showStatsPublicly: user.showStatsPublicly,
    },
    works,
    userWorks: userWorks.map((u) => ({
      workId: u.workId,
      state: u.state,
      currentRating: u.currentRating,
      currentStars: u.currentRating ? scoreToStars(u.currentRating) : null,
      liked: u.liked,
      reviewText: u.reviewText,
      reviewHasSpoiler: u.reviewHasSpoiler,
      reviewedAt: iso(u.reviewedAt),
      currentPage: u.currentPage,
      progressPercent: u.progressPercent,
      startedAt: iso(u.startedAt),
      finishedAt: iso(u.finishedAt),
      viewings: u.rewatchCount,
      watchlistedAt: iso(u.watchlistedAt),
    })),
    journalEntries: entries.map((e) => ({
      workId: e.workId,
      // Sous-unités par numéro : lisible hors de l'application, et
      // rechargeable sans dépendre d'identifiants internes.
      seasonNumber: e.season?.number ?? e.episode?.season.number ?? null,
      episodeNumber: e.episode?.number ?? null,
      tomeNumber: e.tome?.number ?? null,
      loggedAt: iso(e.loggedAt),
      datePrecision: e.datePrecision,
      rating: e.rating,
      stars: e.rating ? scoreToStars(e.rating) : null,
      reviewText: e.reviewText,
      reviewHasSpoiler: e.reviewHasSpoiler,
      isRewatch: e.isRewatch,
      context: e.context,
      isSeasonBatch: e.isSeasonBatch,
      importKey: e.importKey,
    })),
    userSeasons: userSeasons.map((s) => ({
      workId: s.season.workId,
      seasonNumber: s.season.number,
      rating: s.rating,
      stars: s.rating ? scoreToStars(s.rating) : null,
      reviewText: s.reviewText,
      reviewHasSpoiler: s.reviewHasSpoiler,
    })),
    episodeWatches: watches.map((w) => ({
      workId: w.episode.season.workId,
      seasonNumber: w.episode.season.number,
      episodeNumber: w.episode.number,
      watchedAt: iso(w.watchedAt),
    })),
    tomeProgress: tomes.map((t) => ({
      workId: t.tome.workId,
      tomeNumber: t.tome.number,
      state: t.state,
    })),
    readingProgress: reading.map((r) => ({
      workId: r.workId,
      page: r.page,
      percent: r.percent,
      recordedAt: r.recordedAt.toISOString(),
    })),
    imports: imports.map((b) => ({
      id: b.id,
      source: b.source,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      files: b.files,
    })),
    // Une liste vide reste dans l'export : c'est une intention, pas un vide.
    lists: lists.map((l) => ({
      title: l.title,
      slug: l.slug,
      description: l.description,
      isRanked: l.isRanked,
      isPinned: l.isPinned,
      createdAt: l.createdAt.toISOString(),
      importKey: l.importKey,
      items: l.items.map((i) => ({
        workId: i.workId,
        position: i.position,
        note: i.note,
        addedAt: i.createdAt.toISOString(),
      })),
    })),
    tags: tags.map((t) => ({
      name: t.name,
      slug: t.slug,
      works: t.works.map((w) => w.workId),
      entries: t.entries.map((e) => ({
        workId: e.entry.workId,
        loggedAt: iso(e.entry.loggedAt),
      })),
    })),
    favorites: favorites.map((f) => ({
      position: f.position,
      workId: f.workId,
    })),
    quotes: quotes.map((q) => ({
      workId: q.workId,
      tomeNumber: q.tome?.number ?? null,
      edition: q.edition ? editionLabel(q.edition) : null,
      text: q.text,
      page: q.page,
      note: q.note,
      createdAt: q.createdAt.toISOString(),
    })),
    goals: goals.map((g) => ({
      year: g.year,
      scope: g.scope,
      scopeLabel: scopeLabel(g.scope),
      target: g.target,
    })),
    // ── Social (lot 4) ────────────────────────────────────────
    // Les comptes sont désignés par leur pseudonyme, jamais par un identifiant
    // interne — même principe que les sous-unités par leur numéro : le fichier
    // doit rester lisible sans l'application (N4).
    follows: follows.map((f) => ({
      direction: f.followerId === userId ? "abonnement" : "abonné",
      username:
        f.followerId === userId ? f.following.username : f.follower.username,
      name: f.followerId === userId ? f.following.name : f.follower.name,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      acceptedAt: iso(f.acceptedAt),
    })),
    socialLikes: socialLikes.map((l) => ({
      ...socialTargetOf(l),
      createdAt: l.createdAt.toISOString(),
    })),
    comments: comments.map((c) => ({
      ...socialTargetOf(c),
      body: c.body,
      hidden: c.hiddenAt !== null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    blocks: blocks.map((b) => ({
      username: b.blocked.username,
      name: b.blocked.name,
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

type SocialRow = {
  journalEntry: { workId: string; user: { username: string | null } } | null;
  list: { title: string; user: { username: string | null } } | null;
  userWork: { workId: string; user: { username: string | null } } | null;
};

/** Décrit la cible d'un j'aime ou d'un commentaire, en clair. */
function socialTargetOf(row: SocialRow) {
  if (row.journalEntry) {
    return {
      targetKind: "entrée de journal",
      targetAuthor: row.journalEntry.user.username,
      workId: row.journalEntry.workId,
      listTitle: null,
    };
  }
  if (row.list) {
    return {
      targetKind: "liste",
      targetAuthor: row.list.user.username,
      workId: null,
      listTitle: row.list.title,
    };
  }
  if (row.userWork) {
    return {
      targetKind: "critique",
      targetAuthor: row.userWork.user.username,
      workId: row.userWork.workId,
      listTitle: null,
    };
  }
  // La cible a été supprimée entre-temps : on l'exporte quand même, sans quoi
  // le geste disparaîtrait sans trace.
  return {
    targetKind: "inconnue",
    targetAuthor: null,
    workId: null,
    listTitle: null,
  };
}

/** Fiches d'œuvres, lues par pages. */
async function collectWorks(ids: string[]) {
  const out: ExportedDocument["works"] = [];

  for (let i = 0; i < ids.length; i += PAGE) {
    const works = await db.work.findMany({
      where: { id: { in: ids.slice(i, i + PAGE) } },
      orderBy: { titleNormalized: "asc" },
      include: {
        genres: { include: { genre: { select: { name: true } } } },
        creators: { include: { person: { select: { name: true } } } },
        seasons: {
          orderBy: { number: "asc" },
          include: { _count: { select: { episodes: true } } },
        },
        tomes: { orderBy: { number: "asc" } },
        editions: { orderBy: { createdAt: "asc" } },
      },
    });

    for (const w of works) {
      out.push({
        id: w.id,
        type: w.type,
        titleFr: w.titleFr,
        titleOriginal: w.titleOriginal,
        year: w.year,
        synopsis: w.synopsis,
        durationMinutes: w.durationMinutes,
        pageCount: w.pageCount,
        isbn: w.isbn,
        needsCompletion: w.needsCompletion,
        genres: w.genres.map((g) => g.genre.name),
        creators: w.creators.map((c) => ({
          name: c.person.name,
          role: c.role,
        })),
        seasons: w.seasons.map((s) => ({
          number: s.number,
          title: s.title,
          episodes: s._count.episodes,
        })),
        tomes: w.tomes.map((t) => ({
          number: t.number,
          title: t.title,
          pageCount: t.pageCount,
        })),
        editions: w.editions.map((e) => ({
          label: editionLabel(e),
          format: e.format,
          publisher: e.publisher,
          isbn: e.isbn,
          pageCount: e.pageCount,
          isDefault: e.isDefault,
          coversTomeFrom: e.coversTomeFrom,
          coversTomeTo: e.coversTomeTo,
        })),
        coverUrl: w.coverImageId ? `/api/uploads/${w.coverImageId}` : null,
      });
    }
  }

  return out;
}

/** Une entité au format CSV, à partir du même document que le JSON. */
export function entityToCsv(doc: ExportedDocument, entity: CsvEntity): string {
  const titles = new Map(doc.works.map((w) => [w.id, w.titleFr]));
  const titre = (row: { workId: string }) => titles.get(row.workId) ?? "";

  switch (entity) {
    case "journal":
      return toCsv(doc.journalEntries as JournalRow[], [
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
        col("Date", (r) => r.loggedAt),
        col("Précision", (r) => r.datePrecision),
        col("Saison", (r) => r.seasonNumber),
        col("Épisode", (r) => r.episodeNumber),
        col("Tome", (r) => r.tomeNumber),
        col("Note sur 5", (r) => r.stars),
        col("Note sur 10", (r) => r.rating),
        col("Critique", (r) => r.reviewText),
        col("Spoiler", (r) => r.reviewHasSpoiler),
        col("Revisionnage", (r) => r.isRewatch),
        col("Contexte", (r) => r.context),
      ]);

    case "oeuvres":
      return toCsv(doc.works, [
        col("Identifiant", (w) => w.id),
        col("Type", (w) => w.type),
        col("Titre", (w) => w.titleFr),
        col("Titre original", (w) => w.titleOriginal),
        col("Année", (w) => w.year),
        col("Créateurs", (w) => w.creators.map((c) => c.name).join(" ; ")),
        col("Genres", (w) => w.genres.join(" ; ")),
        col("Durée (min)", (w) => w.durationMinutes),
        col("Pages", (w) => w.pageCount),
        col("ISBN", (w) => w.isbn),
        col("À compléter", (w) => w.needsCompletion),
      ]);

    case "suivi":
      return toCsv(doc.userWorks as UserWorkRow[], [
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
        col("Statut", (r) => r.state),
        col("Note sur 5", (r) => r.currentStars),
        col("J'aime", (r) => r.liked),
        col("Critique", (r) => r.reviewText),
        col("Commencé le", (r) => r.startedAt),
        col("Terminé le", (r) => r.finishedAt),
        col("Consommations", (r) => r.viewings),
        col("Page courante", (r) => r.currentPage),
      ]);

    case "saisons":
      return toCsv(doc.userSeasons as SeasonRow[], [
        col("Œuvre", titre),
        col("Saison", (r) => r.seasonNumber),
        col("Note sur 5", (r) => r.stars),
        col("Critique", (r) => r.reviewText),
      ]);

    case "episodes-vus":
      return toCsv(doc.episodeWatches as WatchRow[], [
        col("Œuvre", titre),
        col("Saison", (r) => r.seasonNumber),
        col("Épisode", (r) => r.episodeNumber),
        col("Vu le", (r) => r.watchedAt),
      ]);

    case "tomes":
      return toCsv(doc.tomeProgress as TomeRow[], [
        col("Œuvre", titre),
        col("Tome", (r) => r.tomeNumber),
        col("État", (r) => r.state),
      ]);

    case "progression-lecture":
      return toCsv(doc.readingProgress as ReadingRow[], [
        col("Œuvre", titre),
        col("Page", (r) => r.page),
        col("Pourcentage", (r) => r.percent),
        col("Relevé le", (r) => r.recordedAt),
      ]);

    case "watchlist":
      return toCsv(
        (doc.userWorks as UserWorkRow[]).filter(
          (u) => u.watchlistedAt !== null,
        ),
        [
          col("Œuvre", titre),
          col("Identifiant œuvre", (r) => r.workId),
          col("Ajouté le", (r) => r.watchlistedAt),
        ],
      );

    // Une ligne par élément, l'en-tête de liste répété : le fichier reste
    // lisible sans l'application (N4). Une liste vide garde une ligne, sinon
    // elle disparaîtrait de l'export.
    case "listes":
      return toCsv(flattenLists(doc.lists as ListRow[]), [
        col("Liste", (r) => r.title),
        col("Description", (r) => r.description),
        col("Ordonnée", (r) => r.isRanked),
        col("Épinglée", (r) => r.isPinned),
        col("Position", (r) => r.position),
        col("Œuvre", (r) => (r.workId ? (titles.get(r.workId) ?? "") : "")),
        col("Identifiant œuvre", (r) => r.workId),
        col("Commentaire", (r) => r.note),
      ]);

    case "tags":
      return toCsv(flattenTags(doc.tags as TagRow[]), [
        col("Étiquette", (r) => r.name),
        col("Cible", (r) => r.target),
        col("Œuvre", (r) => (r.workId ? (titles.get(r.workId) ?? "") : "")),
        col("Identifiant œuvre", (r) => r.workId),
        col("Date de journal", (r) => r.loggedAt),
      ]);

    case "favoris":
      return toCsv(doc.favorites as FavoriteRow[], [
        col("Position", (r) => r.position + 1),
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
      ]);

    case "citations":
      return toCsv(doc.quotes as QuoteRow[], [
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
        col("Tome", (r) => r.tomeNumber),
        col("Édition", (r) => r.edition),
        col("Page", (r) => r.page),
        col("Texte", (r) => r.text),
        col("Commentaire", (r) => r.note),
        col("Noté le", (r) => r.createdAt),
      ]);

    case "objectifs":
      return toCsv(doc.goals as GoalRow[], [
        col("Année", (r) => r.year),
        col("Portée", (r) => r.scopeLabel),
        col("Code portée", (r) => r.scope),
        col("Objectif", (r) => r.target),
      ]);

    case "editions":
      return toCsv(flattenEditions(doc.works), [
        col("Œuvre", (r) => r.title),
        col("Identifiant œuvre", (r) => r.workId),
        col("Libellé", (r) => r.label),
        col("Format", (r) => r.format),
        col("Éditeur", (r) => r.publisher),
        col("ISBN", (r) => r.isbn),
        col("Pages", (r) => r.pageCount),
        col("Par défaut", (r) => r.isDefault),
        col("Tomes couverts", (r) => r.covers),
      ]);

    // ── Social (lot 4) ────────────────────────────────────────
    case "abonnements":
      return toCsv(doc.follows as FollowRow[], [
        col("Sens", (r) => r.direction),
        col("Membre", (r) => r.name),
        col("Nom d'utilisateur", (r) => r.username),
        col("Statut", (r) => r.status),
        col("Depuis le", (r) => r.createdAt),
        col("Accepté le", (r) => r.acceptedAt),
      ]);

    case "jaime-sociaux":
      return toCsv(doc.socialLikes as SocialRowCsv[], [
        col("Nature", (r) => r.targetKind),
        col("Auteur", (r) => r.targetAuthor),
        col("Œuvre", (r) => (r.workId ? (titles.get(r.workId) ?? "") : "")),
        col("Identifiant œuvre", (r) => r.workId),
        col("Liste", (r) => r.listTitle),
        col("Le", (r) => r.createdAt),
      ]);

    case "commentaires":
      return toCsv(doc.comments as CommentRow[], [
        col("Nature", (r) => r.targetKind),
        col("Auteur", (r) => r.targetAuthor),
        col("Œuvre", (r) => (r.workId ? (titles.get(r.workId) ?? "") : "")),
        col("Identifiant œuvre", (r) => r.workId),
        col("Liste", (r) => r.listTitle),
        col("Texte", (r) => r.body),
        col("Masqué", (r) => r.hidden),
        col("Publié le", (r) => r.createdAt),
      ]);

    case "blocages":
      return toCsv(doc.blocks as BlockRow[], [
        col("Membre", (r) => r.name),
        col("Nom d'utilisateur", (r) => r.username),
        col("Motif", (r) => r.reason),
        col("Bloqué le", (r) => r.createdAt),
      ]);
  }
}

/** Listes -> une ligne par élément (et une ligne pour une liste vide). */
function flattenLists(lists: ListRow[]): FlatListRow[] {
  const out: FlatListRow[] = [];
  for (const list of lists) {
    const head = {
      title: list.title,
      description: list.description,
      isRanked: list.isRanked,
      isPinned: list.isPinned,
    };
    if (list.items.length === 0) {
      out.push({ ...head, position: null, workId: null, note: null });
      continue;
    }
    for (const item of list.items) {
      out.push({
        ...head,
        // Les positions sont stockées à partir de 0, affichées à partir de 1.
        position: item.position + 1,
        workId: item.workId,
        note: item.note,
      });
    }
  }
  return out;
}

/** Étiquettes -> une ligne par usage, œuvre ou entrée de journal. */
function flattenTags(tags: TagRow[]): FlatTagRow[] {
  const out: FlatTagRow[] = [];
  for (const tag of tags) {
    for (const workId of tag.works) {
      out.push({ name: tag.name, target: "œuvre", workId, loggedAt: null });
    }
    for (const entry of tag.entries) {
      out.push({
        name: tag.name,
        target: "journal",
        workId: entry.workId,
        loggedAt: entry.loggedAt,
      });
    }
  }
  return out;
}

/** Éditions -> une ligne par édition, rattachée au titre de son œuvre. */
function flattenEditions(works: ExportedDocument["works"]): FlatEditionRow[] {
  return works.flatMap((w) =>
    w.editions.map((e) => ({
      title: w.titleFr,
      workId: w.id,
      label: e.label,
      format: e.format,
      publisher: e.publisher,
      isbn: e.isbn,
      pageCount: e.pageCount,
      isDefault: e.isDefault,
      covers: omnibusLabel(e),
    })),
  );
}

// Types de lecture des lignes du document (le document lui-même reste
// volontairement lâche : c'est un format de sortie, pas un modèle interne).
type JournalRow = {
  workId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  tomeNumber: number | null;
  loggedAt: string | null;
  datePrecision: string;
  rating: number | null;
  stars: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  isRewatch: boolean;
  context: string | null;
};
type UserWorkRow = {
  workId: string;
  state: string | null;
  currentStars: number | null;
  liked: boolean;
  reviewText: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  viewings: number;
  currentPage: number | null;
  watchlistedAt: string | null;
};
type SeasonRow = {
  workId: string;
  seasonNumber: number;
  stars: number | null;
  reviewText: string | null;
};
type WatchRow = {
  workId: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string | null;
};
type TomeRow = { workId: string; tomeNumber: number; state: string };
type ListRow = {
  title: string;
  description: string | null;
  isRanked: boolean;
  isPinned: boolean;
  items: { workId: string; position: number; note: string | null }[];
};
type FlatListRow = {
  title: string;
  description: string | null;
  isRanked: boolean;
  isPinned: boolean;
  position: number | null;
  workId: string | null;
  note: string | null;
};
type TagRow = {
  name: string;
  works: string[];
  entries: { workId: string; loggedAt: string | null }[];
};
type FlatTagRow = {
  name: string;
  target: string;
  workId: string;
  loggedAt: string | null;
};
type FavoriteRow = { position: number; workId: string };
type QuoteRow = {
  workId: string;
  tomeNumber: number | null;
  edition: string | null;
  text: string;
  page: number | null;
  note: string | null;
  createdAt: string;
};
type GoalRow = {
  year: number;
  scope: string;
  scopeLabel: string;
  target: number;
};
// Social (lot 4)
type FollowRow = {
  direction: string;
  username: string | null;
  name: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
};
type SocialRowCsv = {
  targetKind: string;
  targetAuthor: string | null;
  workId: string | null;
  listTitle: string | null;
  createdAt: string;
};
type CommentRow = SocialRowCsv & { body: string; hidden: boolean };
type BlockRow = {
  username: string | null;
  name: string;
  reason: string | null;
  createdAt: string;
};
type FlatEditionRow = {
  title: string;
  workId: string;
  label: string;
  format: string | null;
  publisher: string | null;
  isbn: string | null;
  pageCount: number | null;
  isDefault: boolean;
  covers: string | null;
};
type ReadingRow = {
  workId: string;
  page: number | null;
  percent: number | null;
  recordedAt: string;
};

function col<T>(header: string, value: CsvColumn<T>["value"]): CsvColumn<T> {
  return { header, value };
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
