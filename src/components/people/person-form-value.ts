/** Shared (server + client) shape of the person form. */
export type PersonFormValue = {
  fullName: string;
  aliases: string[];
  shortDescription: string;
  biography: string;
  birthDate: string;
  deathDate: string;
  nationality: string;
  roles: string[];
  activityAreas: string;
  portraitUrl: string;
  portraitFileId: string | null;
  websiteUrl: string;
  links: { kind: string; url: string; label: string }[];
  verification: "unverified" | "verified" | "disputed";
};

export const emptyPerson: PersonFormValue = {
  fullName: "",
  aliases: [],
  shortDescription: "",
  biography: "",
  birthDate: "",
  deathDate: "",
  nationality: "",
  roles: [],
  activityAreas: "",
  portraitUrl: "",
  portraitFileId: null,
  websiteUrl: "",
  links: [],
  verification: "unverified",
};
