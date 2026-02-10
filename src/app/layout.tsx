import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskBoard",
  description: "Drag & drop task management with chat-based creation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
