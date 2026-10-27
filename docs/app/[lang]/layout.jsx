import { Footer, Layout, LocaleSwitch, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: "Curso.dev — Notas",
  description: "Minhas anotações do curso.dev",
};

const navbar = (
  <Navbar
    logo={<b>Curso.dev — Notas</b>}
    projectLink="https://github.com/jemluz/clone-tabnews"
  >
    <LocaleSwitch />
  </Navbar>
);
const footer = <Footer>Minhas anotações do curso.dev</Footer>;

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  const pageMap = await getPageMap(`/${lang}`);

  return (
    <html lang={lang} dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={pageMap}
          i18n={[
            { locale: "pt-BR", name: "Português" },
            { locale: "en-US", name: "English" },
          ]}
          docsRepositoryBase="https://github.com/jemluz/clone-tabnews/tree/main/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
