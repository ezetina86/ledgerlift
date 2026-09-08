export default function Label({ children }: { children: string }) {
  return (
    <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </p>
  )
}
