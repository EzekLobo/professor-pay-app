import Link from "next/link";
import "./visitor.css";

const features = [
  ["Rotina em um lugar", "Acompanhe turmas, agenda, alunos e pagamentos sem trocar de planilha."],
  ["Visão para ensinar", "Organize a semana e concentre a atenção no que acontece em cada aula."],
  ["Financeiro claro", "Veja competências, valores previstos e pagamentos recebidos com contexto."],
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="NexusClass, página inicial">
          <span className="landing-brand-mark" aria-hidden="true">N</span>
          NexusClass
        </Link>
        <nav className="landing-nav" aria-label="Navegação principal">
          <a href="#recursos">Recursos</a>
          <a href="https://github.com/EzekLobo/professor-pay-app" target="_blank" rel="noopener noreferrer">Repositório ↗</a>
          <a href="#privacidade">Proteção de dados</a>
          <Link className="landing-login" href="/login">Entrar</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker">PROJETO DE PORTFÓLIO · GESTÃO EDUCACIONAL</p>
          <h1 id="landing-title">Menos planilhas. Mais tempo para cada aula.</h1>
          <p className="landing-lead">
            O NexusClass reúne a rotina pedagógica e financeira de professores em uma visão simples,
            feita para acompanhar alunos, turmas e pagamentos com segurança.
          </p>
          <div className="landing-actions">
            <Link className="button button-primary landing-primary-action" href="/demo">
              Explorar demonstração
            </Link>
            <Link className="button button-ghost landing-secondary-action" href="/login">
              Entrar
            </Link>
          </div>
          <p className="landing-supporting-text">
            A demonstração é pública, usa apenas dados fictícios e pode ser restaurada a qualquer momento.
          </p>
        </div>

        <section className="landing-preview" aria-label="Prévia do painel NexusClass">
          <div className="landing-preview-topbar">
            <span>Resumo da semana</span>
            <span className="landing-preview-chip">Organizado</span>
          </div>
          <div className="landing-preview-metrics">
            <article><span>Turmas ativas</span><strong>2</strong></article>
            <article><span>Alunos</span><strong>4</strong></article>
            <article><span>Aulas da semana</span><strong>3</strong></article>
          </div>
          <div className="landing-preview-agenda">
            <p>Próximas aulas</p>
            <div><b>Seg</b><span>Criatividade Digital · 18:00</span></div>
            <div><b>Qua</b><span>Laboratório de Jogos · 19:00</span></div>
            <div><b>Sex</b><span>Mentoria de portfólio · 17:00</span></div>
          </div>
        </section>
      </section>

      <section id="recursos" className="landing-section" aria-labelledby="features-title">
        <p className="landing-kicker">UMA VISÃO ÚNICA</p>
        <h2 id="features-title">A rotina do professor, sem ruído.</h2>
        <div className="landing-feature-grid">
          {features.map(([title, description], index) => (
            <article className="landing-feature-card" key={title}>
              <span className="landing-feature-number" aria-hidden="true">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="privacidade" className="landing-security" aria-labelledby="privacy-title">
        <div>
          <p className="landing-kicker">PRIVACIDADE POR PADRÃO</p>
          <h2 id="privacy-title">Seus dados de trabalho merecem cuidado.</h2>
        </div>
        <p>
          A conta de produção é protegida por autenticação. Na demonstração, as alterações ficam somente
          neste navegador: não há importação de dados externos, conexão com plataformas de aula ou envio de
          informações para uma conta real.
        </p>
      </section>

      <section className="landing-section" aria-labelledby="project-title">
        <p className="landing-kicker">POR TRÁS DO PROJETO</p>
        <h2 id="project-title">Da rotina real à aplicação.</h2>
        <p className="landing-project-description">Desenvolvido por Ezequiel Oliveira para reunir a agenda, as correções e o acompanhamento financeiro do professor. A demonstração permite conhecer a experiência sem precisar de uma conta ou de acesso à Kodland.</p>
        <div className="landing-tech-list" aria-label="Tecnologias do projeto">
          {["Next.js", "React", "TypeScript", "Firebase", "Vercel"].map((technology) => <span key={technology}>{technology}</span>)}
        </div>
        <a className="button button-ghost" href="https://github.com/EzekLobo/professor-pay-app" target="_blank" rel="noopener noreferrer">Conhecer o código no GitHub ↗</a>
      </section>

      <section className="landing-access" aria-labelledby="access-title">
        <div>
          <p className="landing-kicker">ACESSO CONTROLADO</p>
          <h2 id="access-title">Contas são liberadas pelo administrador.</h2>
          <p>
            Para usar o ambiente de trabalho, peça o seu acesso ao administrador responsável. Assim, cada
            professor entra somente na própria área e nos próprios registros.
          </p>
        </div>
        <Link className="button button-ghost landing-secondary-action" href="/login">Ir para o acesso</Link>
      </section>

      <footer className="landing-footer">
        <span>NexusClass · Ezequiel Oliveira</span>
        <Link href="/demo">Abrir demonstração</Link>
      </footer>
    </main>
  );
}
