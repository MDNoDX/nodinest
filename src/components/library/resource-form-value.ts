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
  publicationDate: string;
  sourceUrl: string;
  sourceNote: string;
  verification: "unverified" | "verified" | "disputed";
  contributors: Contributor[];
  categoryIds: string[];
  tags: string[];
  identifiers: Ident[];
  links: LinkRow[];
  book: {
    publisher: string;
    edition: string;
    pageCount: string;
    originalLanguage: string;
    tableOfContents: string;
    readingUrl: string;
    purchaseUrl: string;
    fileFormat: string;
  };
  media: {
    platform: string;
    channel: string;
    durationMinutes: string;
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
  publicationDate: "",
  sourceUrl: "",
  sourceNote: "",
  verification: "unverified",
  contributors: [],
  categoryIds: [],
  tags: [],
  identifiers: [],
  links: [],
  book: {
    publisher: "",
    edition: "",
    pageCount: "",
    originalLanguage: "",
    tableOfContents: "",
    readingUrl: "",
    purchaseUrl: "",
    fileFormat: "",
  },
  media: { platform: "", channel: "", durationMinutes: "", transcript: "", transcriptUrl: "" },
});
