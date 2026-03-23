export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Tournament Registration — LightChallenge`,
    description: "Register for the tournament and compete",
    openGraph: {
      title: "Tournament Registration — LightChallenge",
      description: "Sign up and compete in the tournament",
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
