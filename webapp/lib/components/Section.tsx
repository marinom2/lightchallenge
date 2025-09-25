export default function Section({title, children}:{title:string, children:React.ReactNode}){
  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
