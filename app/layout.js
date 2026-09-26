import "./styles.css";

export const metadata = {
  title: "AluSaf CRM",
  description: "AluSaf obyektlar, materiallar va jamoa nazorati"
};

export default function RootLayout({ children }) {
  return <html lang="uz"><body>{children}</body></html>;
}
