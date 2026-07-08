import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch about screenings, collaborations, or press inquiries.",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact"
        subtitle="For screenings, collaborations, press inquiries, or just to say hello."
      />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cinema-accent">
                Email
              </h2>
              <a
                href="mailto:hello@yourfilmsite.com"
                className="mt-2 block text-lg text-cinema-text transition-colors hover:text-cinema-accent"
              >
                hello@yourfilmsite.com
              </a>
              <p className="mt-1 text-sm text-cinema-muted">
                Replace with your actual email address.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cinema-accent">
                Social
              </h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="https://instagram.com/yourusername"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinema-muted transition-colors hover:text-cinema-accent"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="https://vimeo.com/yourusername"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinema-muted transition-colors hover:text-cinema-accent"
                  >
                    Vimeo
                  </a>
                </li>
                <li>
                  <a
                    href="https://letterboxd.com/yourusername"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinema-muted transition-colors hover:text-cinema-accent"
                  >
                    Letterboxd
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cinema-accent">
                Press &amp; Screenings
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-cinema-muted">
                For festival submissions, press kits, or screening requests,
                please reach out via email. High-resolution stills and director
                statements are available on request.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-cinema-border/50 bg-cinema-card p-6 sm:p-8">
            <h2 className="font-display text-xl text-cinema-text">
              Send a Message
            </h2>
            <p className="mt-2 text-sm text-cinema-muted">
              This form is a static placeholder. Connect it to a service like
              Formspree, Netlify Forms, or a custom API endpoint when you are
              ready.
            </p>

            <form className="mt-6 space-y-4" action="#" method="POST">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-medium uppercase tracking-wider text-cinema-muted"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="mt-1 w-full rounded-md border border-cinema-border bg-cinema-dark px-4 py-2.5 text-sm text-cinema-text placeholder:text-cinema-muted/50 focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium uppercase tracking-wider text-cinema-muted"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="mt-1 w-full rounded-md border border-cinema-border bg-cinema-dark px-4 py-2.5 text-sm text-cinema-text placeholder:text-cinema-muted/50 focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-medium uppercase tracking-wider text-cinema-muted"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="mt-1 w-full resize-none rounded-md border border-cinema-border bg-cinema-dark px-4 py-2.5 text-sm text-cinema-text placeholder:text-cinema-muted/50 focus:border-cinema-accent focus:outline-none focus:ring-1 focus:ring-cinema-accent"
                  placeholder="Your message..."
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-sm bg-cinema-accent px-6 py-3 text-sm font-medium uppercase tracking-widest text-cinema-black transition-colors hover:bg-cinema-accent-hover"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
