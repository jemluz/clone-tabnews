import { Footer, Layout, Navbar } from "nextra-theme-docs";
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
  />
);
const footer = <Footer>Minhas anotações do curso.dev</Footer>;

export default async function RootLayout({ children }) {
  return (
    <html lang="pt-BR" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/jemluz/clone-tabnews/tree/main/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
