import { getDays } from "../lib/classes";
import { ClassesGrid } from "./classes-grid";

export async function Classes({ lang, dir }) {
  const days = await getDays(lang, dir);
  return <ClassesGrid lang={lang} days={days} />;
}
