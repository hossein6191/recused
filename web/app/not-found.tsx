import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">There is no page at this address</h1>
      <p className="text-muted-foreground">
        Nothing is wrong with the fund or with your wallet. The desk lists every spend, and the ledger every reading.
      </p>
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Start page
        </Link>
        <Link href="/desk" className="text-primary underline-offset-4 hover:underline">
          Desk
        </Link>
        <Link href="/ledger" className="text-primary underline-offset-4 hover:underline">
          Ledger
        </Link>
      </div>
    </div>
  );
}
