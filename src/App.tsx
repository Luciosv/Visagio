function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-neutral-950 px-6 text-neutral-50">
      <h1 className="text-4xl font-semibold tracking-tight">Visagio</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Asistente de visagismo para barbería
      </p>

      <footer className="fixed inset-x-0 bottom-0 py-3 text-center text-xs text-neutral-500">
        v{__APP_VERSION__}
      </footer>
    </div>
  )
}

export default App
