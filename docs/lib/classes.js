import { getPageMap } from "nextra/page-map";

const byOrder = (a, b) =>
  parseFloat(a.order) - parseFloat(b.order) || a.slug.localeCompare(b.slug);

export async function getDays(lang, dir) {
  const pageMap = await getPageMap(`/${lang}/${dir}`);
  const withLang = (route) =>
    route.startsWith(`/${lang}/`) ? route : `/${lang}${route}`;

  return pageMap
    .filter((item) => item.children && /^day-/.test(item.name))
    .map((folder) => {
      const pages = folder.children.filter((child) => child.route);
      const toEntry = (page) => ({
        slug: page.name,
        route: withLang(page.route),
        title: page.frontMatter?.title ?? page.title ?? page.name,
        order: page.frontMatter?.order ?? "0",
      });
      const index = pages.find((page) => page.name === "index");
      const lessons = pages.map(toEntry).sort(byOrder);

      return {
        slug: folder.name,
        number: parseInt(folder.name.replace("day-", ""), 10),
        route: withLang(index?.route ?? folder.route),
        title: index?.frontMatter?.title ?? folder.title,
        favorite: Boolean(index?.frontMatter?.favorite),
        lessonCount: lessons.length,
        lessons,
      };
    })
    .sort((a, b) => a.number - b.number);
}
