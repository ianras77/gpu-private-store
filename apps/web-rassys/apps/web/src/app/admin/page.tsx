import { AdminConsole } from "../../components/AdminConsole";
import { Footer } from "../../components/Footer";

export default function AdminPage() {
  return (
    <main className="min-h-screen">
      <div className="w-full px-6 py-12">
        <h1 className="section-title text-4xl">
          <span className="magical-text">Rassy</span> Admin Deck
        </h1>
        <p className="mt-3 text-cloud/80">Radio control, thought publishing, and image-backed journal posts.</p>
      </div>
      <div className="w-full px-6">
        <AdminConsole />
      </div>
      <Footer />
    </main>
  );
}
