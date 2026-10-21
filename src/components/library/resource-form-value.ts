/** Shared (server + client) shape of the resource form. */
import type { CONTRIBUTOR_ROLES, ResourceType } from "@/lib/validation";

export type Contributor = {
  personId: string | null;
  newPersonName: string | null;
  role: (typeof CONTRIBUTOR_ROLES)[number];
  label: string;
};
export type Ident = { scheme: string; value: string };
export type LinkRow = { kind: string; url: string; label: string };

export type ResourceFormValue = {
  type: ResourceType;
  title: string;
  originalTitle: string;
  description: string;
  coverUrl: string;
  coverFileId: string | null;
  language: string;
  /** Original publication / writing date. */
  originalDate: string;
  /** Edition the user read. */
  publicationDate: string;
  sourceUrl: string;
  contributors: Contributor[];
  categoryIds: string[];
  tags: string[];
  identifiers: Ident[];
  links: LinkRow[];
  book: {
    /** A picked publisher, or a new name typed by the user. */
    publisherId: string | null;
    publisherName: string;
    pageCount: string;
    originalLanguage: string;
    readingUrl: string;
  };
  media: {
    platform: string;
    channel: string;
    /** Total seconds as text ("" = unknown). */
    durationSeconds: string;
    lessonCount: string;
    transcript: string;
    transcriptUrl: string;
  };
};

export const emptyResource = (type: ResourceType = "book"): ResourceFormValue => ({
  type,
  title: "",
  originalTitle: "",
  description: "",
  coverUrl: "",
  coverFileId: null,
  language: "",
  originalDate: "",
  publicationDate: "",
  sourceUrl: "",
  contributors: [],
  categoryIds: [],
  tags: [],
  identifiers: [],
  links: [],
  book: {
    publisherId: null,
    publisherName: "",
    pageCount: "",
    originalLanguage: "",
    readingUrl: "",
  },
  media: {
    platform: "",
    channel: "",
    durationSeconds: "",
    lessonCount: "",
    transcript: "",
    transcriptUrl: "",
  },
});
