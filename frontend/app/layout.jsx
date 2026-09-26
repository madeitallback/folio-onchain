import "./globals.css";
export const metadata = {
  title: "Folio — Stocks, all in one place",
  description:
    "Discover tokenized stocks and ETFs on Solana. Compare options and buy with your own wallet.",
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
