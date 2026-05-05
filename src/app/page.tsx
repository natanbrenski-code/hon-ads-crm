'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type Agent, type Klient, type Miesiac, type Projekt, type Notatka } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ============================================================
// HELPERS
// ============================================================
const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL') + ' zł'
const fmtK = (n: number) => n >= 1000 ? (n/1000).toFixed(0) + ' k zł' : fmt(n)
const initials = (n: string) => (n||'?').split(' ').map((p:string) => p[0]).join('').slice(0,2).toUpperCase()
const AG_COLORS = ['#eef3fd/#1a56e8','#f0fdf4/#15803d','#fdf4ff/#7c3aed','#fffbeb/#b45309','#fef2f2/#b91c1c']
const agStyle = (n: string) => {
  const [bg,c] = AG_COLORS[(n||'').charCodeAt(0) % AG_COLORS.length].split('/')
  return { background: bg, color: c }
}

// ============================================================
// BADGES
// ============================================================
const StanBadge = ({ stan }: { stan: string }) => {
  const map: Record<string,string> = { 'Aktywny':'#f0fdf4/#15803d', 'Wypowiedzenie':'#fdf4ff/#7c3aed', 'Ostatnia faktura':'#fff7ed/#c2410c', 'Zakończony':'#f7f6f3/#9e9c97' }
  const [bg,c] = (map[stan]||'#f7f6f3/#9e9c97').split('/')
  return <span style={{ background:bg, color:c, padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>{stan||'—'}</span>
}

const FakBadge = ({ f }: { f: string }) => {
  if(f==='Opłacona') return <span style={{ background:'#f0fdf4', color:'#15803d', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>✓ Opłacona</span>
  if(f==='Po terminie') return <span style={{ background:'#fef2f2', color:'#b91c1c', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>⚠ Po terminie</span>
  return <span style={{ background:'#fffbeb', color:'#b45309', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>– brak</span>
}

const SegBadge = ({ s }: { s: string }) => {
  const map: Record<string,[string,string]> = { 'Segment A':['#eef3fd','#1a56e8'], 'Segment B':['#f0fdf4','#15803d'] }
  const [bg,c] = map[s] || ['#f7f6f3','#9e9c97']
  return <span style={{ background:bg, color:c, padding:'1px 5px', borderRadius:4, fontSize:10, fontWeight:500 }}>{s?.replace('Segment ','')}</span>
}

// ============================================================
// MODAL
// ============================================================
function Modal({ open, onClose, title, sub, children, footer }: any) {
  if(!open) return null
  return (
    <div onClick={e => { if(e.target===e.currentTarget) onClose() }} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div style={{
        background:'var(--surf)', borderRadius:'var(--rl)', width:580, maxWidth:'96vw',
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)'
      }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'.5px solid var(--brd)', display:'flex', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:500 }}>{title}</div>
            {sub && <div style={{ fontSize:11, color:'var(--tx2)', marginTop:2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:17, color:'var(--tx2)' }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px' }}>{children}</div>
        {footer && <div style={{ padding:'14px 22px', borderTop:'.5px solid var(--brd)', display:'flex', gap:8 }}>{footer}</div>}
      </div>
    </div>
  )
}

// ============================================================
// MAIN APP
// ============================================================
export default function CRMApp() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard')
  const [toast, setToast] = useState('')

  // Data
  const [agenci, setAgenci] = useState<Agent[]>([])
  const [klienci, setKlienci] = useState<Klient[]>([])
  const [miesiace, setMiesiace] = useState<Miesiac[]>([])
  const [projekty, setProjekty] = useState<Projekt[]>([])
  const [notatki, setNotatki] = useState<Notatka[]>([])
  const [curMiesiacId, setCurMiesiacId] = useState<string>('')
  const [curAgent, setCurAgent] = useState<Agent|null>(null)

  // Filters
  const [projSearch, setProjSearch] = useState('')
  const [projStan, setProjStan] = useState('')
  const [projSeg, setProjSeg] = useState('')
  const [projAgentF, setProjAgentF] = useState('')
  const [projFilter, setProjFilter] = useState('')

  // Modal
  const [modal, setModal] = useState<any>(null)
  const [curProjId, setCurProjId] = useState<string|null>(null)
  const [curKlientId, setCurKlientId] = useState<string|null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if(!data.user) { router.push('/login'); return }
      setUser(data.user)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if(event === 'SIGNED_OUT') router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load data
  const loadData = useCallback(async () => {
    const [a, k, m, p, n] = await Promise.all([
      supabase.from('agenci').select('*').order('imie_nazwisko'),
      supabase.from('klienci').select('*').order('nazwa'),
      supabase.from('miesiace').select('*').order('rok').order('miesiac'),
      supabase.from('projekty_full').select('*'),
      supabase.from('notatki').select('*, agenci(imie_nazwisko)').order('created_at', { ascending: false }),
    ])
    if(a.data) setAgenci(a.data)
    if(k.data) setKlienci(k.data)
    if(m.data) {
      setMiesiace(m.data)
      if(m.data.length > 0 && !curMiesiacId) setCurMiesiacId(m.data[m.data.length-1].id)
    }
    if(p.data) setProjekty(p.data)
    if(n.data) setNotatki(n.data.map((x:any) => ({ ...x, agent_nazwa: x.agenci?.imie_nazwisko })))
  }, [curMiesiacId])

  useEffect(() => { if(!loading) loadData() }, [loading, loadData])

  const curProjekty = projekty.filter(p => p.miesiac_id === curMiesiacId)
  const curMiesiac = miesiace.find(m => m.id === curMiesiacId)

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if(loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="spinner" />
    </div>
  )

  // ============================================================
  // FILTERED PROJECTS
  // ============================================================
  const filteredProj = curProjekty
    .filter(p => p.stan !== 'Zakończony')
    .filter(p => {
      if(projSearch && !p.domena.toLowerCase().includes(projSearch.toLowerCase()) && !(p.klient_nazwa||'').toLowerCase().includes(projSearch.toLowerCase())) return false
      if(projStan && p.stan !== projStan) return false
      if(projSeg && p.segment !== projSeg) return false
      if(projAgentF && p.agent_nazwa !== projAgentF) return false
      if(projFilter === 'od' && p.faktura !== 'Po terminie') return false
      if(projFilter === 'brak' && p.faktura) return false
      return true
    })
    .sort((a,b) => (a.dzien_faktury||99)-(b.dzien_faktury||99))

  // ============================================================
  // DASHBOARD DATA
  // ============================================================
  const active = curProjekty.filter(p => p.stan !== 'Zakończony')
  const mrr = active.reduce((s,p) => s+(p.wynagrodzenie||0), 0)
  const bud = active.reduce((s,p) => s+(p.budzet_wydany||0), 0)
  const od = active.filter(p => p.faktura === 'Po terminie').length
  const nb = active.filter(p => !p.faktura).length

  const prevMiesiac = miesiace[miesiace.findIndex(m=>m.id===curMiesiacId)-1]
  const prevProjekty = prevMiesiac ? projekty.filter(p=>p.miesiac_id===prevMiesiac.id) : []
  const prevMrr = prevProjekty.reduce((s,p)=>s+(p.wynagrodzenie||0),0)
  const mrrGr = prevMrr > 0 ? ((mrr-prevMrr)/prevMrr*100) : null

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* TOPBAR */}
      <div style={{
        background:'var(--surf)', borderBottom:'.5px solid var(--brd)',
        padding:'0 20px', display:'flex', alignItems:'center', height:48,
        gap:6, position:'sticky', top:0, zIndex:100
      }}>
        <div style={{ fontSize:14, fontWeight:500, marginRight:12, flexShrink:0 }}>
          HON <span style={{ color:'var(--acc)' }}>ads</span>
        </div>
        {['dashboard','projekty','klienci','agenci'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding:'5px 10px', borderRadius:'var(--r)', fontSize:12,
            border:'none', cursor:'pointer',
            background: view===v ? 'var(--acc-bg)' : 'none',
            color: view===v ? 'var(--acc)' : 'var(--tx2)',
            fontWeight: view===v ? 500 : 400,
            textTransform:'capitalize'
          }}>{v==='dashboard'?'Dashboard':v==='projekty'?'Projekty':v==='klienci'?'Klienci':'Agenci'}</button>
        ))}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {/* Miesiąc */}
          <select value={curMiesiacId} onChange={e => setCurMiesiacId(e.target.value)} style={{
            border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 10px',
            fontSize:12, fontWeight:500, background:'var(--bg)', color:'var(--tx)', cursor:'pointer'
          }}>
            {miesiace.map(m => <option key={m.id} value={m.id}>{m.nazwa}</option>)}
          </select>

          {/* Agent */}
          <select value={curAgent?.id||''} onChange={e => setCurAgent(agenci.find(a=>a.id===e.target.value)||null)} style={{
            border:'.5px solid var(--brd2)', borderRadius:20, padding:'4px 10px',
            fontSize:12, background:'var(--bg)', color:'var(--tx2)', cursor:'pointer'
          }}>
            <option value="">— Agent</option>
            {agenci.map(a => <option key={a.id} value={a.id}>{a.imie_nazwisko}</option>)}
          </select>

          <button onClick={() => showToast('Nowy miesiąc — wkrótce!')} style={{
            background:'var(--surf)', border:'.5px solid var(--brd2)', borderRadius:'var(--r)',
            padding:'5px 12px', fontSize:12, fontWeight:500
          }}>✦ Nowy miesiąc</button>

          <button onClick={logout} style={{
            background:'none', border:'none', fontSize:11, color:'var(--tx3)'
          }}>Wyloguj</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ padding:20, maxWidth:1300, margin:'0 auto' }}>

        {/* ==================== DASHBOARD ==================== */}
        {view === 'dashboard' && (
          <div>
            {/* Metrics */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10, marginBottom:20 }}>
              {[
                { lbl:'MRR łącznie', val:fmt(mrr), sub: mrrGr!==null ? `${mrrGr>=0?'▲':'▼'} ${fmt(Math.abs(mrr-prevMrr))} (${Math.abs(mrrGr).toFixed(1)}%)` : 'brak danych porównawczych', subColor: mrrGr!==null?(mrrGr>=0?'var(--green)':'var(--red)'):'var(--tx3)' },
                { lbl:'Aktywne projekty', val:String(active.filter(p=>p.stan==='Aktywny').length), sub:`z ${active.length} wszystkich`, subColor:'var(--tx3)' },
                { lbl:'Budżet reklamowy', val:fmt(bud), sub:'wydany ten miesiąc', subColor:'var(--tx3)' },
                { lbl:'Po terminie', val:String(od), sub:`${nb} bez statusu`, subColor: od>0?'var(--red)':'var(--tx3)', valColor: od>0?'var(--red)':undefined },
              ].map((m,i) => (
                <div key={i} style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:'14px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--tx3)', fontWeight:500, marginBottom:6 }}>{m.lbl}</div>
                  <div style={{ fontSize:22, fontWeight:500, letterSpacing:-.5, color:m.valColor||'var(--tx)' }}>{m.val}</div>
                  <div style={{ fontSize:11, color:m.subColor, marginTop:3 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Usługi */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:20 }}>
              {[
                { lbl:'Performance Marketing', val:active.reduce((s,p)=>s+p.pm,0), cnt:active.filter(p=>p.pm>0).length },
                { lbl:'SEO', val:active.reduce((s,p)=>s+p.seo,0), cnt:active.filter(p=>p.seo>0).length },
                { lbl:'Content Marketing', val:active.reduce((s,p)=>s+p.content,0), cnt:active.filter(p=>p.content>0).length },
              ].map((s,i) => (
                <div key={i} style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, color:'var(--tx3)', fontWeight:500, marginBottom:4 }}>{s.lbl}</div>
                  <div style={{ fontSize:17, fontWeight:500 }}>{fmt(s.val)}</div>
                  <div style={{ fontSize:10, color:'var(--tx3)', marginTop:2 }}>{s.cnt} projektów</div>
                </div>
              ))}
            </div>

            {/* MRR tabela */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
              <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:16 }}>
                <div style={{ fontSize:12, fontWeight:500, marginBottom:12 }}>MRR miesiąc do miesiąca</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr>{['Miesiąc','MRR','Wzrost','PM','SEO','Content'].map(h=>(
                      <th key={h} style={{ fontSize:10, color:'var(--tx3)', fontWeight:500, padding:'0 6px 7px', borderBottom:'.5px solid var(--brd)', textAlign: h==='Miesiąc'?'left':'right' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {[...miesiace].reverse().map((m,i) => {
                      const mp = projekty.filter(p=>p.miesiac_id===m.id)
                      const mi = mp.reduce((s,p)=>s+(p.wynagrodzenie||0),0)
                      const prevM = miesiace[miesiace.findIndex(x=>x.id===m.id)-1]
                      const pi = prevM ? projekty.filter(p=>p.miesiac_id===prevM.id).reduce((s,p)=>s+(p.wynagrodzenie||0),0) : 0
                      const g = pi>0?((mi-pi)/pi*100):null
                      const diff = mi-pi
                      const cur = m.id === curMiesiacId
                      return (
                        <tr key={m.id} style={{ background: cur?'var(--acc)':undefined }}>
                          <td style={{ padding:'8px 6px', color: cur?'#fff':'var(--tx)', borderBottom:'.5px solid var(--brd)', fontWeight:cur?500:400 }}>{m.nazwa}</td>
                          <td style={{ padding:'8px 6px', color: cur?'#fff':'var(--tx)', borderBottom:'.5px solid var(--brd)', textAlign:'right', fontWeight:cur?500:400 }}>{fmt(mi)}</td>
                          <td style={{ padding:'8px 6px', borderBottom:'.5px solid var(--brd)', textAlign:'right' }}>
                            {g!==null?<span style={{ fontSize:10, fontWeight:500, color: cur?'#a7f3d0':g>=0?'var(--green)':'var(--red)' }}>{g>=0?'▲':'▼'} {fmt(Math.abs(diff))}</span>:'—'}
                          </td>
                          {[mp.reduce((s,p)=>s+p.pm,0),mp.reduce((s,p)=>s+p.seo,0),mp.reduce((s,p)=>s+p.content,0)].map((v,j)=>(
                            <td key={j} style={{ padding:'8px 6px', color:cur?'#fff':'var(--tx)', borderBottom:'.5px solid var(--brd)', textAlign:'right' }}>{fmt(v)}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:16 }}>
                <div style={{ fontSize:12, fontWeight:500, marginBottom:12 }}>Budżet wg kanału</div>
                {[
                  ['Google',active.reduce((s,p)=>s+p.google_w,0),'#4285f4'],
                  ['Meta',active.reduce((s,p)=>s+p.meta_w,0),'#1877f2'],
                  ['TikTok',active.reduce((s,p)=>s+p.tiktok_w,0),'#444'],
                  ['Pinterest',active.reduce((s,p)=>s+p.pinterest_w,0),'#e60023'],
                  ['LinkedIn',active.reduce((s,p)=>s+p.linkedin_w,0),'#0a66c2'],
                  ['Promocja',active.reduce((s,p)=>s+p.promo_w,0),'#7c3aed'],
                ].filter(([,v])=>(v as number)>0).map(([l,v,cl]) => {
                  const maxB = Math.max(...active.map(p=>Math.max(p.google_w,p.meta_w,p.tiktok_w)),1)
                  return (
                    <div key={l as string} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                      <div style={{ fontSize:11, color:'var(--tx2)', width:65, flexShrink:0 }}>{l}</div>
                      <div style={{ flex:1, height:5, background:'var(--bg)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:3, background:cl as string, width:`${Math.round((v as number)/bud*100)}%` }} />
                      </div>
                      <div style={{ fontSize:11, color:'var(--tx2)', width:70, textAlign:'right' }}>{fmtK(v as number)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== PROJEKTY ==================== */}
        {view === 'projekty' && (
          <div>
            <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
              <input placeholder="Szukaj projektu lub klienta..." value={projSearch} onChange={e=>setProjSearch(e.target.value)}
                style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 10px', fontSize:12, background:'var(--bg)', color:'var(--tx)', width:200 }} />
              <select value={projSeg} onChange={e=>setProjSeg(e.target.value)}
                style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 8px', fontSize:12, background:'var(--surf)', color:'var(--tx)' }}>
                <option value="">Wszystkie segmenty</option>
                <option>Segment A</option><option>Segment B</option><option>Segment C</option>
              </select>
              <select value={projStan} onChange={e=>setProjStan(e.target.value)}
                style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 8px', fontSize:12, background:'var(--surf)', color:'var(--tx)' }}>
                <option value="">Wszystkie statusy</option>
                <option>Aktywny</option><option>Wypowiedzenie</option><option>Ostatnia faktura</option>
              </select>
              <select value={projAgentF} onChange={e=>setProjAgentF(e.target.value)}
                style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 8px', fontSize:12, background:'var(--surf)', color:'var(--tx)' }}>
                <option value="">Wszyscy agenci</option>
                {agenci.map(a => <option key={a.id}>{a.imie_nazwisko}</option>)}
              </select>
              <div style={{ display:'flex', gap:4 }}>
                {[['','Wszyscy'],['od','⚠ Po terminie'],['brak','Bez faktury']].map(([f,l]) => (
                  <button key={f} onClick={()=>setProjFilter(f)}
                    style={{ border:'.5px solid var(--brd2)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:500, cursor:'pointer', background:projFilter===f?'var(--tx)':'var(--surf)', color:projFilter===f?'#fff':'var(--tx2)' }}>{l}</button>
                ))}
              </div>
              <button onClick={()=>setModal({type:'add-proj'})} style={{ marginLeft:'auto', background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'6px 13px', fontSize:12, fontWeight:500 }}>+ Nowy projekt</button>
            </div>

            <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:900 }}>
                <thead>
                  <tr style={{ background:'var(--bg)', borderBottom:'.5px solid var(--brd)' }}>
                    {['Dzień','Projekt / klient','Stan','Faktura','Seg.','PM','SEO','Content','Budżet dekl.','Wydany','Różnica','Agent',''].map((h,i) => (
                      <th key={i} style={{ padding:'8px 12px', textAlign: i>4?'right':'left', fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, whiteSpace:'nowrap', borderLeft:i===8?'.5px solid var(--brd)':undefined }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProj.length === 0 ? (
                    <tr><td colSpan={13} style={{ textAlign:'center', padding:32, color:'var(--tx3)' }}>Brak projektów</td></tr>
                  ) : (() => {
                    let lastDay = -1
                    return filteredProj.flatMap(p => {
                      const day = p.dzien_faktury || 99
                      const rows = []
                      if(day !== lastDay) {
                        lastDay = day
                        rows.push(
                          <tr key={`sep-${day}`} style={{ background:'var(--bg)', borderBottom:'.5px solid var(--brd)' }}>
                            <td colSpan={13} style={{ padding:'5px 12px', fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4 }}>
                              {day===99?'Brak ustalonego dnia':day+'. dnia miesiąca'}
                            </td>
                          </tr>
                        )
                      }
                      const diff = (p.budzet_wydany||0) - (p.budzet_dekl||0)
                      rows.push(
                        <tr key={p.id} onClick={()=>{ setCurProjId(p.id); setView('projekt') }}
                          style={{ borderBottom:'.5px solid var(--brd)', cursor:'pointer' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <td style={{ padding:'10px 12px' }}>
                            <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--bg)', border:'.5px solid var(--brd)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:500, color:'var(--tx2)' }}>
                              {day===99?'?':day}
                            </div>
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div style={{ fontWeight:500, fontSize:12 }}>{p.domena}</div>
                            <div style={{ fontSize:10, color:'var(--tx3)' }}>{p.klient_nazwa||'—'}</div>
                          </td>
                          <td style={{ padding:'10px 12px' }}><StanBadge stan={p.stan} /></td>
                          <td style={{ padding:'10px 12px' }}><FakBadge f={p.faktura} /></td>
                          <td style={{ padding:'10px 12px' }}><SegBadge s={p.segment} /></td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>{p.pm>0?fmt(p.pm):'—'}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>{p.seo>0?fmt(p.seo):'—'}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>{p.content>0?fmt(p.content):'—'}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right', borderLeft:'.5px solid var(--brd)' }}>{(p.budzet_dekl||0)>0?fmt(p.budzet_dekl||0):'—'}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>{(p.budzet_wydany||0)>0?fmt(p.budzet_wydany||0):'—'}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right' }}>
                            {(p.budzet_dekl||0)>0 ? <span style={{ fontSize:10, fontWeight:500, color:diff>0?'var(--red)':'var(--green)' }}>{diff>0?'+':''}{fmt(diff)}</span> : '—'}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            {p.agent_nazwa ? (
                              <div style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                <div style={{ width:20, height:20, borderRadius:'50%', ...agStyle(p.agent_nazwa), display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:500 }}>
                                  {initials(p.agent_nazwa)}
                                </div>
                                <span style={{ fontSize:11, color:'var(--tx2)' }}>{p.agent_nazwa.split(' ')[0]}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <button onClick={e=>{e.stopPropagation();setCurProjId(p.id);setView('projekt')}}
                              style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:4, padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--tx2)' }}>→</button>
                          </td>
                        </tr>
                      )
                      return rows
                    })
                  })()}
                </tbody>
              </table>

              {/* Summary */}
              <div style={{ display:'flex', gap:14, padding:'7px 12px', background:'var(--bg)', borderTop:'.5px solid var(--brd)', fontSize:11, color:'var(--tx2)', flexWrap:'wrap' }}>
                <span>Projektów: <strong style={{ color:'var(--tx)' }}>{filteredProj.length}</strong></span>
                <span>MRR: <strong style={{ color:'var(--tx)' }}>{fmt(filteredProj.reduce((s,p)=>s+(p.wynagrodzenie||0),0))}</strong></span>
                <span>Budżet dekl.: <strong style={{ color:'var(--tx)' }}>{fmt(filteredProj.reduce((s,p)=>s+(p.budzet_dekl||0),0))}</strong></span>
                <span>Wydany: <strong style={{ color:'var(--tx)' }}>{fmt(filteredProj.reduce((s,p)=>s+(p.budzet_wydany||0),0))}</strong></span>
                <span>Po terminie: <strong style={{ color:'var(--red)' }}>{filteredProj.filter(p=>p.faktura==='Po terminie').length}</strong></span>
                <span>Bez faktury: <strong style={{ color:'var(--amber)' }}>{filteredProj.filter(p=>!p.faktura).length}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== KARTA PROJEKTU ==================== */}
        {view === 'projekt' && (() => {
          const p = projekty.find(x=>x.id===curProjId)
          if(!p) return <div>Brak projektu</div>
          const pNotes = notatki.filter(n=>n.projekt_id===p.id)
          const ch = [
            ['Google Ads',p.google_d,p.google_w,'#4285f4'],
            ['Meta Ads',p.meta_d,p.meta_w,'#1877f2'],
            ['TikTok Ads',p.tiktok_d,p.tiktok_w,'#444'],
            ['Pinterest Ads',p.pinterest_d,p.pinterest_w,'#e60023'],
            ['LinkedIn Ads',p.linkedin_d,p.linkedin_w,'#0a66c2'],
            ['Promocja postów',p.promo_d,p.promo_w,'#7c3aed'],
          ].filter(([,d,w])=>(d as number)>0||(w as number)>0)

          return (
            <div>
              <div style={{ padding:'10px 0', fontSize:12, color:'var(--tx3)', display:'flex', alignItems:'center', gap:5, marginBottom:16 }}>
                <a onClick={()=>setView('projekty')} style={{ color:'var(--acc)', cursor:'pointer' }}>Projekty</a>
                <span>›</span>
                <strong style={{ color:'var(--tx)' }}>{p.domena}</strong>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:16 }}>
                <div>
                  {/* Hero */}
                  <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', marginBottom:14 }}>
                    <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--brd)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:20, fontWeight:500 }}>{p.domena}</div>
                        <div style={{ fontSize:12, color:'var(--tx2)', marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
                          {p.klient_nazwa ? <>
                            <span>{p.klient_nazwa}</span>
                            <a onClick={()=>{ setCurKlientId(p.klient_id||null); setView('klient') }} style={{ color:'var(--acc)', fontSize:11, cursor:'pointer' }}>→ karta klienta</a>
                          </> : <span style={{ color:'var(--tx3)' }}>brak klienta</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                        <select value={curMiesiacId} onChange={e=>setCurMiesiacId(e.target.value)}
                          style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 10px', fontSize:12, fontWeight:500, background:'var(--bg)', color:'var(--tx)', cursor:'pointer' }}>
                          {miesiace.map(m=><option key={m.id} value={m.id}>{m.nazwa}</option>)}
                        </select>
                        <button onClick={()=>setModal({type:'edit-proj', proj:p})}
                          style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'5px 12px', fontSize:12, color:'var(--tx2)', cursor:'pointer' }}>Edytuj</button>
                        {p.raport && <button onClick={()=>window.open(p.raport!)}
                          style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'5px 12px', fontSize:12, fontWeight:500, cursor:'pointer' }}>↗ Raport</button>}
                      </div>
                    </div>
                    <div style={{ padding:'14px 18px' }}>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
                        <StanBadge stan={p.stan} />
                        <FakBadge f={p.faktura} />
                        <span style={{ background:'var(--bg)', color:'var(--tx2)', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>{p.forma}</span>
                        <span style={{ background:'var(--bg)', color:'var(--tx2)', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:500 }}>{p.forma_rozl}</span>
                        <SegBadge s={p.segment} />
                        {p.agent_nazwa && <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--bg)', borderRadius:4, padding:'2px 7px' }}>
                          <div style={{ width:16, height:16, borderRadius:'50%', ...agStyle(p.agent_nazwa), display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:500 }}>{initials(p.agent_nazwa)}</div>
                          <span style={{ fontSize:10, fontWeight:500 }}>{p.agent_nazwa}</span>
                        </span>}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, paddingTop:12, borderTop:'.5px solid var(--brd)' }}>
                        {[['Okres rozliczeniowy',p.okres],['Dzień faktury',(p.dzien_faktury||'—')+'. miesiąca'],['Miesiąc',curMiesiac?.nazwa||'—'],['Ostatnia aktywność',pNotes[0]?.created_at?.slice(0,16).replace('T',' ')||'brak']].map(([l,v]) => (
                          <div key={l as string}>
                            <div style={{ fontSize:9, color:'var(--tx3)', fontWeight:500, textTransform:'uppercase', letterSpacing:.3, marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:12, fontWeight:500 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Wynagrodzenie i budżet */}
                  <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)' }}>
                    <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--brd)', display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, fontWeight:500 }}>Wynagrodzenie i budżet</span>
                      <span style={{ fontSize:11, color:'var(--tx3)' }}>{curMiesiac?.nazwa}</span>
                    </div>
                    <div style={{ padding:'14px 18px' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                        {[['Performance Marketing',p.pm],['SEO',p.seo],['Content Marketing',p.content]].map(([l,v]) => (
                          <div key={l as string} style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:'10px 12px' }}>
                            <div style={{ fontSize:9, color:'var(--tx3)', fontWeight:500, marginBottom:4 }}>{l}</div>
                            <div style={{ fontSize:15, fontWeight:500 }}>{(v as number)>0?fmt(v as number):'—'}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:'var(--acc-bg)', borderRadius:'var(--r)', padding:'9px 12px', display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                        <span style={{ fontSize:11, color:'var(--acc)', fontWeight:500 }}>Łączne wynagrodzenie</span>
                        <span style={{ fontSize:16, fontWeight:500, color:'var(--acc)' }}>{fmt(p.wynagrodzenie||0)}</span>
                      </div>

                      {ch.length > 0 && <>
                        <div style={{ fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, marginBottom:10 }}>Budżet reklamowy — kanały</div>
                        {ch.map(([name,d,w,color]) => {
                          const diff = (w as number)-(d as number)
                          const maxW = Math.max(w as number, d as number, 1)
                          return (
                            <div key={name as string} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                              <div style={{ fontSize:11, color:'var(--tx2)', width:110, flexShrink:0 }}>{name}</div>
                              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
                                <div style={{ height:4, background:'var(--bg)', borderRadius:2, overflow:'hidden' }}>
                                  <div style={{ height:'100%', borderRadius:2, background:'var(--brd2)', width:`${Math.round((d as number)/maxW*100)}%` }} />
                                </div>
                                <div style={{ height:4, background:'var(--bg)', borderRadius:2, overflow:'hidden' }}>
                                  <div style={{ height:'100%', borderRadius:2, background:color as string, width:`${Math.round((w as number)/maxW*100)}%` }} />
                                </div>
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1, width:85, flexShrink:0 }}>
                                <div style={{ fontSize:10, color:'var(--tx3)' }}>dekl. {(d as number)>0?fmt(d as number):'—'}</div>
                                <div style={{ fontSize:11, fontWeight:500 }}>{(w as number)>0?fmt(w as number):'—'}</div>
                                {(d as number)>0&&(w as number)>0&&<div style={{ fontSize:10, fontWeight:500, color:diff>0?'var(--red)':'var(--green)' }}>{diff>0?'+':''}{fmt(diff)}</div>}
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'9px 12px', background:'var(--bg)', borderRadius:'var(--r)', marginTop:6 }}>
                          {[['Deklarowany',p.budzet_dekl||0],['Wydany',p.budzet_wydany||0]].map(([l,v])=>(
                            <div key={l as string}>
                              <div style={{ fontSize:10, color:'var(--tx3)' }}>{l}</div>
                              <div style={{ fontSize:13, fontWeight:500 }}>{fmt(v as number)}</div>
                            </div>
                          ))}
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:10, color:'var(--tx3)' }}>Różnica</div>
                            <div style={{ fontSize:13, fontWeight:500, color:(p.budzet_wydany||0)>(p.budzet_dekl||0)?'var(--red)':'var(--green)' }}>
                              {(p.budzet_wydany||0)>(p.budzet_dekl||0)?'+':''}{fmt((p.budzet_wydany||0)-(p.budzet_dekl||0))}
                            </div>
                          </div>
                        </div>
                      </>}
                    </div>
                  </div>
                </div>

                {/* Notatki */}
                <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--brd)', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, fontWeight:500 }}>Notatki</span>
                    <span style={{ fontSize:11, color:'var(--tx3)' }}>{pNotes.length} notatek</span>
                  </div>
                  <div style={{ padding:'14px 18px' }}>
                    {/* Formularz */}
                    <NoteForm projektId={p.id} agenci={agenci} curAgent={curAgent} miesiacId={curMiesiacId}
                      onSave={async (nota: any) => {
                        const { data } = await supabase.from('notatki').insert(nota).select('*, agenci(imie_nazwisko)').single()
                        if(data) setNotatki(prev => [{ ...data, agent_nazwa: data.agenci?.imie_nazwisko }, ...prev])
                        showToast('Notatka dodana ✓')
                      }} />
                    {/* Lista */}
                    {pNotes.length===0 ? (
                      <div style={{ textAlign:'center', padding:20, color:'var(--tx3)', fontSize:12 }}>Brak notatek</div>
                    ) : pNotes.map(n => (
                      <div key={n.id} style={{ borderBottom:'.5px solid var(--brd)', paddingBottom:10, marginBottom:10 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5, flexWrap:'wrap' }}>
                          <div style={{ width:24, height:24, borderRadius:'50%', ...agStyle(n.agent_nazwa||'?'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:500 }}>
                            {initials(n.agent_nazwa||'?')}
                          </div>
                          <span style={{ fontSize:12, fontWeight:500 }}>{n.agent_nazwa||'—'}</span>
                          {(() => {
                            const catColors: Record<string,[string,string]> = {
                              'Kontakt telefoniczny':['var(--acc-bg)','var(--acc)'],
                              'Kontakt mailowy':['var(--green-bg)','var(--green)'],
                              'Spotkanie online':['#fdf4ff','#7c3aed'],
                            }
                            const [bg,c] = catColors[n.kategoria]||['var(--bg)','var(--tx3)']
                            return <span style={{ background:bg, color:c, fontSize:10, fontWeight:500, padding:'1px 6px', borderRadius:4 }}>{n.kategoria}</span>
                          })()}
                          <span style={{ fontSize:10, color:'var(--tx3)' }}>{n.data_kontaktu?.slice(0,16).replace('T',' ')}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--tx)', lineHeight:1.5 }}>{n.tresc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ==================== KLIENCI ==================== */}
        {view === 'klienci' && (
          <div>
            <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
              <input placeholder="Szukaj klienta..." style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 10px', fontSize:12, background:'var(--bg)', color:'var(--tx)', width:220 }} />
              <button onClick={()=>setModal({type:'add-klient'})} style={{ marginLeft:'auto', background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'6px 13px', fontSize:12, fontWeight:500 }}>+ Nowy klient</button>
            </div>
            <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--bg)', borderBottom:'.5px solid var(--brd)' }}>
                    {['Klient','Projekty','Kontakt','MRR','Budżet wydany',''].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {klienci.length===0 ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:32, color:'var(--tx3)' }}>Brak klientów — dodaj pierwszego!</td></tr>
                  ) : klienci.map(k => {
                    const kp = curProjekty.filter(p=>p.klient_id===k.id && p.stan!=='Zakończony')
                    const mrr = kp.reduce((s,p)=>s+(p.wynagrodzenie||0),0)
                    const bud = kp.reduce((s,p)=>s+(p.budzet_wydany||0),0)
                    return (
                      <tr key={k.id} onClick={()=>{ setCurKlientId(k.id); setView('klient') }}
                        style={{ borderBottom:'.5px solid var(--brd)', cursor:'pointer' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='')}>
                        <td style={{ padding:'11px 12px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                            <div style={{ width:30, height:30, borderRadius:'50%', ...agStyle(k.nazwa), display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:500, flexShrink:0 }}>{initials(k.nazwa)}</div>
                            <div>
                              <div style={{ fontWeight:500, fontSize:12 }}>{k.nazwa}</div>
                              <div style={{ fontSize:10, color:'var(--tx3)' }}>NIP: {k.nip||'—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'11px 12px' }}>
                          {kp.map(p=><span key={p.id} style={{ background:'var(--bg)', border:'.5px solid var(--brd)', borderRadius:4, padding:'1px 6px', fontSize:10, color:'var(--tx2)', display:'inline-block', margin:1 }}>{p.domena}</span>)}
                          {kp.length===0&&<span style={{ color:'var(--tx3)', fontSize:11 }}>—</span>}
                        </td>
                        <td style={{ padding:'11px 12px' }}>
                          <div style={{ fontSize:12 }}>{k.kontakt||'—'}</div>
                          <div style={{ fontSize:10, color:'var(--tx3)' }}>{k.telefon||''}</div>
                        </td>
                        <td style={{ padding:'11px 12px', fontWeight:500 }}>{fmt(mrr)}</td>
                        <td style={{ padding:'11px 12px', color:'var(--tx2)' }}>{fmt(bud)}</td>
                        <td style={{ padding:'11px 12px' }}>
                          <button style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:4, padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--tx2)' }}>→</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== KARTA KLIENTA ==================== */}
        {view === 'klient' && (() => {
          const k = klienci.find(x=>x.id===curKlientId)
          if(!k) return <div>Brak klienta</div>
          const kp = curProjekty.filter(p=>p.klient_id===k.id && p.stan!=='Zakończony')
          const mrr = kp.reduce((s,p)=>s+(p.wynagrodzenie||0),0)
          const bw = kp.reduce((s,p)=>s+(p.budzet_wydany||0),0)
          const bd = kp.reduce((s,p)=>s+(p.budzet_dekl||0),0)
          return (
            <div>
              <div style={{ padding:'10px 0', fontSize:12, color:'var(--tx3)', display:'flex', alignItems:'center', gap:5, marginBottom:16 }}>
                <a onClick={()=>setView('klienci')} style={{ color:'var(--acc)', cursor:'pointer' }}>Klienci</a>
                <span>›</span><strong style={{ color:'var(--tx)' }}>{k.nazwa}</strong>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16 }}>
                <div>
                  <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', marginBottom:14 }}>
                    <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--brd)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', ...agStyle(k.nazwa), display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:500 }}>{initials(k.nazwa)}</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:500 }}>{k.nazwa}</div>
                          <div style={{ fontSize:11, color:'var(--tx3)' }}>{kp.length} aktywnych projektów</div>
                        </div>
                      </div>
                      <button onClick={()=>setModal({type:'edit-klient',klient:k})}
                        style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'4px 10px', fontSize:11, cursor:'pointer', color:'var(--tx2)' }}>Edytuj</button>
                    </div>
                    <div style={{ padding:'14px 18px' }}>
                      {[['NIP',k.nip],['Adres',k.adres],['Osoba kontaktowa',k.kontakt],['Telefon',k.telefon],['Email',k.email],['Email do faktur',k.email_faktury]].map(([l,v])=>(
                        <div key={l as string} style={{ paddingBottom:7, marginBottom:7, borderBottom:'.5px solid var(--brd)' }}>
                          <div style={{ fontSize:9, color:'var(--tx3)', fontWeight:500, textTransform:'uppercase', letterSpacing:.3, marginBottom:2 }}>{l}</div>
                          <div style={{ fontSize:12 }}>{v||'—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10, marginBottom:14 }}>
                    {[['MRR łącznie',fmt(mrr)],['Budżet dekl.',fmt(bd)],['Budżet wydany',fmt(bw)],['Projektów',String(kp.length)]].map(([l,v])=>(
                      <div key={l as string} style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:'10px 12px' }}>
                        <div style={{ fontSize:9, color:'var(--tx3)', fontWeight:500, marginBottom:4 }}>{l}</div>
                        <div style={{ fontSize:16, fontWeight:500 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)' }}>
                    <div style={{ padding:'14px 18px', borderBottom:'.5px solid var(--brd)', display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, fontWeight:500 }}>Projekty klienta</span>
                      <button onClick={()=>setModal({type:'add-proj', defaultKlient:k.id})}
                        style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'4px 10px', fontSize:11, fontWeight:500, cursor:'pointer' }}>+ Dodaj projekt</button>
                    </div>
                    <div style={{ padding:'14px 18px' }}>
                      {kp.length===0 ? (
                        <div style={{ textAlign:'center', padding:20, color:'var(--tx3)', fontSize:12 }}>Brak aktywnych projektów</div>
                      ) : kp.map(p=>(
                        <div key={p.id} onClick={()=>{ setCurProjId(p.id); setView('projekt') }}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'.5px solid var(--brd)', cursor:'pointer' }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:500 }}>{p.domena}</div>
                            <div style={{ display:'flex', gap:4, marginTop:3 }}><StanBadge stan={p.stan} /><FakBadge f={p.faktura} /><SegBadge s={p.segment} /></div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:12, fontWeight:500 }}>{fmt(p.wynagrodzenie||0)}</div>
                            <div style={{ fontSize:10, color:'var(--tx3)' }}>budżet: {fmt(p.budzet_wydany||0)}</div>
                          </div>
                          <button style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:4, padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--tx2)', flexShrink:0 }}>→</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ==================== AGENCI ==================== */}
        {view === 'agenci' && (
          <div>
            <div style={{ marginBottom:16, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={()=>setModal({type:'add-agent'})}
                style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'6px 13px', fontSize:12, fontWeight:500 }}>+ Dodaj agenta</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:14 }}>
              {agenci.map(a => {
                const an = notatki.filter(n=>n.agent_id===a.id || n.agent_nazwa===a.imie_nazwisko)
                const ap = curProjekty.filter(p=>p.agent_id===a.id && p.stan!=='Zakończony')
                const cats = ['Kontakt telefoniczny','Kontakt mailowy','Spotkanie online','Inne']
                const maxC = Math.max(...cats.map(c=>an.filter(n=>n.kategoria===c).length),1)
                return (
                  <div key={a.id} style={{ background:'var(--surf)', border:'.5px solid var(--brd)', borderRadius:'var(--rl)', padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                      <div style={{ width:42, height:42, borderRadius:'50%', ...agStyle(a.imie_nazwisko), display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:500 }}>{initials(a.imie_nazwisko)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{a.imie_nazwisko}</div>
                        <div style={{ fontSize:10, color:'var(--tx3)' }}>{a.email||'—'}</div>
                      </div>
                      <button onClick={()=>setModal({type:'edit-agent',agent:a})}
                        style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--tx2)' }}>edytuj</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, marginBottom:12 }}>
                      {[['Notatki',an.length],['Projekty',ap.length]].map(([l,v])=>(
                        <div key={l as string} style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:'9px 10px' }}>
                          <div style={{ fontSize:9, color:'var(--tx3)', fontWeight:500, marginBottom:3 }}>{l}</div>
                          <div style={{ fontSize:15, fontWeight:500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {cats.map(c => {
                      const cnt = an.filter(n=>n.kategoria===c).length
                      const colors: Record<string,string> = {'Kontakt telefoniczny':'#1a56e8','Kontakt mailowy':'#15803d','Spotkanie online':'#7c3aed','Inne':'#9e9c97'}
                      return (
                        <div key={c} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <div style={{ fontSize:10, color:'var(--tx2)', width:120, flexShrink:0 }}>{c}</div>
                          <div style={{ flex:1, height:4, background:'var(--bg)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', borderRadius:2, background:colors[c], width:`${Math.round(cnt/maxC*100)}%` }} />
                          </div>
                          <div style={{ fontSize:10, fontWeight:500, color:'var(--tx)', width:18, textAlign:'right' }}>{cnt}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* ==================== MODALS ==================== */}
      <ProjectModal open={modal?.type==='add-proj'||modal?.type==='edit-proj'} proj={modal?.proj} defaultKlient={modal?.defaultKlient}
        klienci={klienci} agenci={agenci} miesiace={miesiace} curMiesiacId={curMiesiacId}
        onClose={()=>setModal(null)}
        onSave={async (data:any) => {
          if(modal?.type==='edit-proj') {
            await supabase.from('projekty').update(data).eq('id', modal.proj.id)
          } else {
            await supabase.from('projekty').insert({ ...data, miesiac_id: curMiesiacId })
          }
          await loadData()
          showToast(modal?.type==='edit-proj'?'Zapisano ✓':'Dodano projekt ✓')
          setModal(null)
        }} />

      <KlientModal open={modal?.type==='add-klient'||modal?.type==='edit-klient'} klient={modal?.klient}
        onClose={()=>setModal(null)}
        onSave={async (data:any) => {
          if(modal?.type==='edit-klient') {
            await supabase.from('klienci').update(data).eq('id', modal.klient.id)
          } else {
            await supabase.from('klienci').insert(data)
          }
          await loadData()
          showToast(modal?.type==='edit-klient'?'Zapisano ✓':'Dodano klienta ✓')
          setModal(null)
        }} />

      <AgentModal open={modal?.type==='add-agent'||modal?.type==='edit-agent'} agent={modal?.agent}
        onClose={()=>setModal(null)}
        onSave={async (data:any) => {
          if(modal?.type==='edit-agent') {
            await supabase.from('agenci').update(data).eq('id', modal.agent.id)
          } else {
            await supabase.auth.signUp({ email: data.email, password: data.password })
            await supabase.from('agenci').insert({ imie_nazwisko: data.imie_nazwisko, email: data.email, aktywny: true })
          }
          await loadData()
          showToast('Zapisano ✓')
          setModal(null)
        }} />

      {/* TOAST */}
      <div className={`toast ${toast?'show':''}`}>{toast}</div>
    </div>
  )
}

// ============================================================
// NOTE FORM
// ============================================================
function NoteForm({ projektId, agenci, curAgent, miesiacId, onSave }: any) {
  const [cat, setCat] = useState('Kontakt telefoniczny')
  const [agent, setAgent] = useState(curAgent?.imie_nazwisko||'')
  const [date, setDate] = useState(new Date().toISOString().slice(0,16))
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if(!content.trim()) return
    setSaving(true)
    const ag = agenci.find((a:any)=>a.imie_nazwisko===agent)
    await onSave({ projekt_id:projektId, agent_id:ag?.id, kategoria:cat, data_kontaktu:date, tresc:content })
    setContent('')
    setSaving(false)
  }

  return (
    <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12, marginBottom:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:7 }}>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)' }}>
          {['Kontakt telefoniczny','Kontakt mailowy','Spotkanie online','Inne'].map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={agent} onChange={e=>setAgent(e.target.value)}
          style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)' }}>
          {agenci.map((a:any)=><option key={a.id}>{a.imie_nazwisko}</option>)}
        </select>
      </div>
      <input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}
        style={{ width:'100%', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', marginBottom:7 }} />
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Treść notatki..."
        style={{ width:'100%', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'7px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', resize:'vertical', minHeight:64, fontFamily:'inherit' }} />
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:7 }}>
        <button onClick={handleSave} disabled={saving||!content.trim()}
          style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'6px 14px', fontSize:12, fontWeight:500, cursor:'pointer', opacity:saving?0.6:1 }}>
          {saving?'Zapisywanie...':'Dodaj notatkę'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// PROJECT MODAL
// ============================================================
function ProjectModal({ open, proj, defaultKlient, klienci, agenci, miesiace, curMiesiacId, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({})
  const s = (k:string,v:any) => setForm((f:any)=>({...f,[k]:v}))

  useEffect(()=>{
    if(proj) setForm(proj)
    else setForm({ stan:'Aktywny', faktura:'', segment:'Segment C', forma:'Umowa', forma_rozl:'Z góry', dzien_faktury:1, okres:'01 - 31', pm:0, seo:0, content:0, google_d:0,meta_d:0,tiktok_d:0,pinterest_d:0,linkedin_d:0,promo_d:0, google_w:0,meta_w:0,tiktok_w:0,pinterest_w:0,linkedin_w:0,promo_w:0, klient_id:defaultKlient||'' })
  }, [proj, defaultKlient, open])

  const n = (v:any) => parseFloat(v)||0
  const inp = (id:string,label:string,type='text') => (
    <div className="mf">
      <label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>{label}</label>
      <input type={type} value={form[id]||''} onChange={e=>s(id,type==='number'?parseFloat(e.target.value)||0:e.target.value)}
        style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} />
    </div>
  )
  const sel = (id:string,label:string,opts:string[]) => (
    <div className="mf">
      <label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>{label}</label>
      <select value={form[id]||''} onChange={e=>s(id,e.target.value)}
        style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }}>
        {opts.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={proj?'Edytuj: '+proj.domena:'Nowy projekt'} sub={proj?'Zmiany zapisują się do bazy':''}
      footer={<>
        <button onClick={()=>onSave({
          domena:form.domena, klient_id:form.klient_id||null, agent_id:form.agent_id||null,
          stan:form.stan, faktura:form.faktura, segment:form.segment, forma:form.forma, forma_rozl:form.forma_rozl,
          dzien_faktury:n(form.dzien_faktury), okres:form.okres, zrodlo:form.zrodlo, raport:form.raport,
          pm:n(form.pm), seo:n(form.seo), content:n(form.content),
          google_d:n(form.google_d),meta_d:n(form.meta_d),tiktok_d:n(form.tiktok_d),pinterest_d:n(form.pinterest_d),linkedin_d:n(form.linkedin_d),promo_d:n(form.promo_d),
          google_w:n(form.google_w),meta_w:n(form.meta_w),tiktok_w:n(form.tiktok_w),pinterest_w:n(form.pinterest_w),linkedin_w:n(form.linkedin_w),promo_w:n(form.promo_w),
        })} style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>
          {proj?'Zapisz':'Dodaj projekt'}
        </button>
        <button onClick={onClose} style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>Anuluj</button>
      </>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {!proj && <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Domena</label>
          <input value={form.domena||''} onChange={e=>s('domena',e.target.value)} placeholder="np. sklep.pl"
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} />
        </div>}
        <div className="mf">
          <label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Klient</label>
          <select value={form.klient_id||''} onChange={e=>s('klient_id',e.target.value)}
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }}>
            <option value="">— brak</option>
            {klienci.map((k:any)=><option key={k.id} value={k.id}>{k.nazwa}</option>)}
          </select>
        </div>
        <div className="mf">
          <label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Agent</label>
          <select value={form.agent_id||''} onChange={e=>s('agent_id',e.target.value)}
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }}>
            <option value="">— brak</option>
            {agenci.map((a:any)=><option key={a.id} value={a.id}>{a.imie_nazwisko}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, marginBottom:8, paddingBottom:5, borderBottom:'.5px solid var(--brd)' }}>Wynagrodzenie</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {inp('pm','PM (zł)','number')}{inp('seo','SEO (zł)','number')}{inp('content','Content (zł)','number')}
        {sel('forma_rozl','Forma rozliczenia',['Z góry','Z dołu'])}
      </div>

      <div style={{ fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, marginBottom:8, paddingBottom:5, borderBottom:'.5px solid var(--brd)' }}>Budżety deklarowane</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {inp('google_d','Google Ads','number')}{inp('meta_d','Meta Ads','number')}
        {inp('tiktok_d','TikTok Ads','number')}{inp('pinterest_d','Pinterest Ads','number')}
        {inp('linkedin_d','LinkedIn Ads','number')}{inp('promo_d','Promocja postów','number')}
      </div>

      <div style={{ fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, marginBottom:8, paddingBottom:5, borderBottom:'.5px solid var(--brd)' }}>Budżety wydane</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {inp('google_w','Google Ads','number')}{inp('meta_w','Meta Ads','number')}
        {inp('tiktok_w','TikTok Ads','number')}{inp('pinterest_w','Pinterest Ads','number')}
        {inp('linkedin_w','LinkedIn Ads','number')}{inp('promo_w','Promocja postów','number')}
      </div>

      <div style={{ fontSize:10, fontWeight:500, color:'var(--tx3)', textTransform:'uppercase', letterSpacing:.4, marginBottom:8, paddingBottom:5, borderBottom:'.5px solid var(--brd)' }}>Status i dane</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {sel('stan','Stan',['Aktywny','Wypowiedzenie','Ostatnia faktura','Zakończony'])}
        {sel('faktura','Faktura',['','Opłacona','Po terminie'])}
        {sel('segment','Segment',['Segment A','Segment B','Segment C'])}
        {sel('forma','Forma',['Umowa','Zlecenie','Brak umowy'])}
        {inp('dzien_faktury','Dzień faktury','number')}
        {inp('okres','Okres rozliczeniowy')}
        {inp('zrodlo','Źródło')}
        <div style={{ gridColumn:'1/-1' }}>{inp('raport','Link do raportu')}</div>
      </div>
    </Modal>
  )
}

// ============================================================
// KLIENT MODAL
// ============================================================
function KlientModal({ open, klient, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({})
  const s = (k:string,v:any) => setForm((f:any)=>({...f,[k]:v}))
  useEffect(()=>{ setForm(klient||{}) }, [klient,open])
  const inp = (id:string,label:string) => (
    <div><label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>{label}</label>
      <input value={form[id]||''} onChange={e=>s(id,e.target.value)}
        style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} />
    </div>
  )
  return (
    <Modal open={open} onClose={onClose} title={klient?'Edytuj klienta':'Nowy klient'} sub={klient?.nazwa}
      footer={<>
        <button onClick={()=>onSave(form)} style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>Zapisz</button>
        <button onClick={onClose} style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>Anuluj</button>
      </>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ gridColumn:'1/-1' }}>{inp('nazwa','Nazwa firmy')}</div>
        {inp('nip','NIP')}{inp('kontakt','Osoba kontaktowa')}
        {inp('telefon','Telefon')}{inp('email','Email')}
        {inp('email_faktury','Email do faktur')}
        <div style={{ gridColumn:'1/-1' }}>{inp('adres','Adres')}</div>
      </div>
    </Modal>
  )
}

// ============================================================
// AGENT MODAL
// ============================================================
function AgentModal({ open, agent, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({})
  const s = (k:string,v:any) => setForm((f:any)=>({...f,[k]:v}))
  useEffect(()=>{ setForm(agent||{}) }, [agent,open])
  return (
    <Modal open={open} onClose={onClose} title={agent?'Edytuj agenta':'Nowy agent'}
      footer={<>
        <button onClick={()=>onSave(form)} style={{ background:'var(--acc)', color:'#fff', border:'none', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>Zapisz</button>
        <button onClick={onClose} style={{ background:'none', border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'7px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>Anuluj</button>
      </>}>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div><label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Imię i nazwisko</label>
          <input value={form.imie_nazwisko||''} onChange={e=>s('imie_nazwisko',e.target.value)} placeholder="Jan Kowalski"
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} /></div>
        <div><label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Email</label>
          <input type="email" value={form.email||''} onChange={e=>s('email',e.target.value)} placeholder="jan@honads.pl"
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} /></div>
        {!agent && <div><label style={{ fontSize:11, color:'var(--tx2)', display:'block', marginBottom:3, fontWeight:500 }}>Hasło</label>
          <input type="password" value={form.password||''} onChange={e=>s('password',e.target.value)} placeholder="Min. 6 znaków"
            style={{ border:'.5px solid var(--brd2)', borderRadius:'var(--r)', padding:'6px 9px', fontSize:12, background:'var(--surf)', color:'var(--tx)', width:'100%' }} /></div>}
      </div>
    </Modal>
  )
}
