export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Live Tournament — LightChallenge`,
    description: "Live tournament updates and match feed",
    openGraph: {
      title: "Live Tournament — LightChallenge",
      description: "Follow the tournament action as it happens",
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
