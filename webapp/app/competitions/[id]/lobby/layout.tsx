export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Tournament Lobby — LightChallenge`,
    description: "Tournament lobby and match preparation",
    openGraph: {
      title: "Tournament Lobby — LightChallenge",
      description: "Get ready for your next tournament match",
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
