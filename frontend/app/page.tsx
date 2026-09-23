import Logo from "@/components/Logo";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <Logo />

      <div className="mt-16">
        <h1 className="text-4xl font-bold">
          AI-powered security analysis
        </h1>

        <p className="mt-4 text-gray-600">
          Scan, understand, remediate, and verify security vulnerabilities.
        </p>
      </div>
    </main>
  );
}