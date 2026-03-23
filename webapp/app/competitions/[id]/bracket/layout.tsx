export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Tournament Bracket — LightChallenge`,
    description: "Live tournament bracket viewer",
    openGraph: {
      title: "Tournament Bracket — LightChallenge",
      description: "Watch the tournament unfold in real-time",
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
