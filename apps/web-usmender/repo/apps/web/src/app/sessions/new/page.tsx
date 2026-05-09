import NewSessionForm from '../../../components/NewSessionForm';

export const dynamic = 'force-dynamic';

export default function NewSessionPage() {
  return (
    <main>
      <section className="page-header">
        <div className="pill">Start a room</div>
        <h1>Open a warm, moderated channel between two people.</h1>
        <p className="microcopy">
          This is where the messaging flow begins: private draft, mediated rewrite, invitation,
          and then a guided conversation inside the room.
        </p>
      </section>

      <NewSessionForm />
    </main>
  );
}
