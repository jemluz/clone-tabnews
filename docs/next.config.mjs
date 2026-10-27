import nextra from "nextra";

const withNextra = nextra({});

export default withNextra({
  i18n: {
    locales: ["pt-BR", "en-US"],
    defaultLocale: "pt-BR",
  },
  async redirects() {
    return [{ source: "/", destination: "/pt-BR", permanent: false }];
  },
});
