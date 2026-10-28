import { redirect } from "next/navigation";

/** Old link: people are found in Search and followed from the profile. */
export default function Community() {
  redirect("/profile");
}
