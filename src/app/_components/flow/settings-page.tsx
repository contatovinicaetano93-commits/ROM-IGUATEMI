"use client";

import { FormEvent, useState } from "react";
import { Building2, Plus, Tags } from "lucide-react";
import { cls } from "@/lib/flow/format";
import type { Category, Company } from "@/lib/flow/types";

export function SettingsPage({
  companies,
  categories,
  onCreateCompany,
  onCreateCategory,
  onToggleCategory,
}: {
  companies: Company[];
  categories: Category[];
  onCreateCompany: (input: { name: string; color: string }) => void | Promise<void>;
  onCreateCategory: (input: { name: string; color: string }) => void | Promise<void>;
  onToggleCategory: (id: string, is_active: boolean) => void | Promise<void>;
}) {
  const [modal, setModal] = useState<"company" | "category" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#10B981");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (modal === "company") {
      await onCreateCompany({ name, color });
      setSuccess("Empresa adicionada com sucesso.");
    } else if (modal === "category") {
      await onCreateCategory({ name, color });
      setSuccess("Categoria adicionada com sucesso.");
    }
    setName("");
    setColor("#10B981");
    setModal(null);
  }

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h2>Configurações do grupo</h2>
          <p>Gerencie empresas, categorias e parâmetros essenciais do ROM Flow.</p>
        </div>
      </section>
      {success ? <div className="success-banner">{success}</div> : null}
      <section className="settings-grid">
        <article className="panel settings-card">
          <header>
            <div className="settings-icon pink">
              <Building2 size={19} />
            </div>
            <div>
              <h3>Empresas da unidade</h3>
              <p>{companies.length} negócios deste painel — catálogo fixo da intranet</p>
            </div>
          </header>
          <div className="settings-list">
            {companies.map((company) => (
              <div key={company.id}>
                <i style={{ background: company.color }}>{company.initials}</i>
                <span>
                  <strong>{company.name}</strong>
                  <small>{company.legal_name}</small>
                </span>
                <em className={cls(company.is_active && "active")}>
                  {company.is_active ? "Ativa" : "Inativa"}
                </em>
              </div>
            ))}
          </div>
        </article>
        <article className="panel settings-card">
          <header>
            <div className="settings-icon emerald">
              <Tags size={19} />
            </div>
            <div>
              <h3>Categorias de despesas</h3>
              <p>{categories.filter((item) => item.is_active).length} categorias disponíveis</p>
            </div>
            <button type="button" onClick={() => setModal("category")}>
              <Plus size={13} /> Nova
            </button>
          </header>
          <div className="settings-list">
            {categories.map((category) => (
              <div key={category.id}>
                <i className="category-dot" style={{ background: category.color }} />
                <span>
                  <strong>{category.name}</strong>
                  <small>Disponível nos formulários</small>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleCategory(category.id, !category.is_active)}
                >
                  <em className={cls(category.is_active && "active")}>
                    {category.is_active ? "Ativa" : "Inativa"}
                  </em>
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      {modal ? (
        <div className="modal-layer">
          <button className="modal-overlay" onClick={() => setModal(null)} />
          <form className="action-modal" onSubmit={handleSubmit}>
            <header>
              <div className="modal-icon emerald">
                {modal === "company" ? <Building2 size={20} /> : <Tags size={20} />}
              </div>
              <div>
                <h3>{modal === "company" ? "Nova empresa" : "Nova categoria"}</h3>
                <p>Parâmetros essenciais do ROM Flow</p>
              </div>
            </header>
            <label>
              Nome <span>*</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Cor
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="primary-button">Salvar</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
