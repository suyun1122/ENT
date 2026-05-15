import "./globals.css";
import NavBar from "./components/NavBar";
import { Providers } from "./providers";

export const metadata = {
  title: "Surgical Video Intelligence",
  description: "Local YOLO surgical instrument detection and motion analysis demo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
