import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md text-center p-8 rounded">
        <h1 className="text-7xl font-display text-gold">404</h1>
        <h2 className="mt-4 text-xl text-foreground">Lost in the Aden continent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The path you sought does not exist on these lands.
        </p>
        <div className="mt-6">
          <a href="/" className="inline-block border border-gold text-gold px-5 py-2 rounded font-display tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors">
            Return to Launcher
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md text-center p-8 rounded">
        <h1 className="text-xl font-display text-gold">The ritual failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unknown error occurred."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="border border-gold text-gold px-4 py-2 rounded font-display tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Try again
          </button>
          <a href="/" className="border border-border px-4 py-2 rounded hover:bg-accent transition-colors">
            Launcher
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lineage II — Web Client" },
      { name: "description", content: "Experimental browser-based Lineage 2 client. Render your own Interlude client assets in WebGL." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
