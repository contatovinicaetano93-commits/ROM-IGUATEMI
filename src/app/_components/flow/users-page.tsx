"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Copy, Link2, Mail, Pencil, Search, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { ROLE_CLASS, ROLE_LABEL, AREA_LABEL, cls, formatDate } from "@/lib/flow/format";
import type { Company, Invitation, RequestArea, Role, User } from "@/lib/flow/types";
import { REQUEST_AREAS, areaForAdminRole } from "@/lib/flow/workflow";

function signupUrl(token: string) {
  return `${window.location.origin}/convite?token=${token}`;
}

function assignedCompanies(ids: string[], companies: Company[]): Company[] {
  return ids
    .map((id) => companies.find((item) => item.id === id))
    .filter((item): item is Company => Boolean(item));
}

function CompanyChips({ ids, companies }: { ids: string[]; companies: Company[] }) {
  const assigned = assignedCompanies(ids, companies);
  if (assigned.length === 0) {
    return <span className="no-companies-tag">Nenhuma empresa atribuída</span>;
  }
  return (
    <div className="user-companies-chips">
      {assigned.map((company) => (
        <span key={company.id} className="company-badge-pill" style={{ borderLeftColor: company.color }}>
          {company.name}
        </span>
      ))}
    </div>
  );
}

function CompanyPicker({
  companies,
  selected,
  onChange,
}: {
  companies: Company[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="company-selection-group">
      <div className="company-selection-header">
        <p className="company-selection-label">Empresas de acesso</p>
        <div className="company-selection-actions">
          <button type="button" onClick={() => onChange(companies.map((item) => item.id))}>
            Marcar todas
          </button>
          <span>•</span>
          <button type="button" onClick={() => onChange([])}>
            Desmarcar
          </button>
        </div>
      </div>
      <div className="company-checkbox-grid">
        {companies.map((company) => {
          const checked = selected.includes(company.id);
          return (
            <label key={company.id} className={cls("company-checkbox-card", checked && "checked")}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== company.id)
                      : [...selected, company.id],
                  )
                }
              />
              <i className="company-dot" style={{ background: company.color }} />
              <span className="company-info">
                <strong>{company.name}</strong>
                <small>{company.legal_name}</small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="signup-field-hint">
        O usuário só vê e opera nas empresas marcadas. Selecione ao menos uma.
      </p>
    </div>
  );
}

function AreaPicker({
  selected,
  onChange,
  role,
}: {
  selected: RequestArea[];
  onChange: (next: RequestArea[]) => void;
  role: Role;
}) {
  if (role !== "solicitante") {
    const area = areaForAdminRole(role);
    return (
      <p className="signup-field-hint">
        Área deste perfil: <strong>{area ? AREA_LABEL[area] : "Todas"}</strong>
      </p>
    );
  }
  return (
    <div className="company-selection-group">
      <p className="company-selection-label">Áreas que o solicitante pode abrir</p>
      <div className="company-checkbox-grid">
        {REQUEST_AREAS.map((area) => {
          const checked = selected.includes(area);
          return (
            <label key={area} className={cls("company-checkbox-card", checked && "checked")}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? selected.filter((item) => item !== area) : [...selected, area])
                }
              />
              <span className="company-info">
                <strong>{AREA_LABEL[area]}</strong>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as Role)}>
      <option value="solicitante">Solicitante</option>
      <option value="admin_financeiro">Admin financeiro</option>
      <option value="admin_manutencao">Admin manutenção</option>
      <option value="admin_compras">Admin compras</option>
      <option value="admin_rh">Admin RH</option>
      <option value="master">Master</option>
    </select>
  );
}

type EditingTarget =
  | { kind: "user"; user: User }
  | { kind: "invitation"; invitation: Invitation };

export function UsersPage({
  users,
  invitations,
  companies,
  currentUserId,
  onInvite,
  onUpdateUser,
  onUpdateInvitation,
  onToggle,
  onRevoke,
  onCancelInvite,
}: {
  users: User[];
  invitations: Invitation[];
  companies: Company[];
  currentUserId: string;
  onInvite: (
    email: string,
    role: Role,
    companyIds: string[],
    areaIds: RequestArea[],
  ) => Promise<Invitation & { emailSent?: boolean; emailError?: string }>;
  onUpdateUser: (userId: string, role: Role, companyIds: string[], areaIds: RequestArea[]) => Promise<void>;
  onUpdateInvitation: (
    invitationId: string,
    role: Role,
    companyIds: string[],
    areaIds: RequestArea[],
  ) => Promise<void>;
  onToggle: (userId: string) => void;
  onRevoke: (userId: string) => Promise<void>;
  onCancelInvite: (invitationId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("solicitante");
  const [selected, setSelected] = useState<string[]>([]);
  const [areas, setAreas] = useState<RequestArea[]>(["financeiro"]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{
    email: string;
    link: string;
    emailSent: boolean;
    emailError?: string;
  } | null>(null);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editRole, setEditRole] = useState<Role>("solicitante");
  const [editSelected, setEditSelected] = useState<string[]>([]);
  const [editAreas, setEditAreas] = useState<RequestArea[]>(["financeiro"]);
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<{ kind: "user" | "invite"; id: string; label: string } | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);

  const pendingInvites = useMemo(
    () => invitations.filter((item) => !item.accepted),
    [invitations],
  );

  const filtered = useMemo(
    () =>
      users.filter(
        (item) =>
          item.status === "active" &&
          `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, users],
  );

  function closeModal() {
    setOpen(false);
    setEmail("");
    setSelected([]);
    setAreas(["financeiro"]);
    setError("");
    setCreated(null);
    setSubmitting(false);
    setRole("solicitante");
  }

  function closeEdit() {
    setEditing(null);
    setEditError("");
    setEditSubmitting(false);
  }

  function startUserEdit(user: User) {
    setOpen(false);
    setEditing({ kind: "user", user });
    setEditRole(user.role);
    setEditSelected([...user.companyIds]);
    setEditAreas(user.areaIds.length ? user.areaIds : ["financeiro"]);
    setEditError("");
  }

  function startInviteEdit(invitation: Invitation) {
    setOpen(false);
    setEditing({ kind: "invitation", invitation });
    setEditRole(invitation.role);
    setEditSelected([...invitation.companyIds]);
    setEditAreas(invitation.areaIds.length ? invitation.areaIds : ["financeiro"]);
    setEditError("");
  }

  async function copyLink(link: string, id: string) {
    await navigator.clipboard.writeText(link);
    setCopied(id);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (selected.length === 0) {
      setError("Selecione ao menos uma empresa de acesso.");
      return;
    }
    setSubmitting(true);
    try {
      const invitation = await onInvite(email, role, selected, areas);
      const link = invitation.token ? signupUrl(invitation.token) : "";
      setCreated({
        email: invitation.email,
        link,
        emailSent: Boolean(invitation.emailSent),
        emailError: invitation.emailError,
      });
      const passwordMatch = invitation.emailError?.match(/Senha inicial: (.+)$/);
      if (link && !link.endsWith("token=")) {
        await copyLink(link, "created");
      } else if (passwordMatch?.[1]) {
        await copyLink(passwordMatch[1], "created");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) {
      return;
    }
    setEditError("");
    if (editSelected.length === 0) {
      setEditError("Selecione ao menos uma empresa de acesso.");
      return;
    }
    setEditSubmitting(true);
    try {
      switch (editing.kind) {
        case "user":
          await onUpdateUser(editing.user.id, editRole, editSelected, editAreas);
          break;
        case "invitation":
          await onUpdateInvitation(editing.invitation.id, editRole, editSelected, editAreas);
          break;
        default: {
          const unexpected: never = editing;
          throw new Error(`Edição não suportada: ${JSON.stringify(unexpected)}`);
        }
      }
      closeEdit();
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "Não foi possível salvar o acesso.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleRevoke() {
    if (!confirmRevoke) {
      return;
    }
    setRevoking(true);
    setError("");
    try {
      if (confirmRevoke.kind === "user") {
        await onRevoke(confirmRevoke.id);
      } else {
        await onCancelInvite(confirmRevoke.id);
      }
      setConfirmRevoke(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir o acesso.");
    } finally {
      setRevoking(false);
    }
  }

  const editingTitle = editing
    ? editing.kind === "user"
      ? `Editar acesso de ${editing.user.name}`
      : `Editar convite de ${editing.invitation.email}`
    : "";

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">ACESSO E SEGURANÇA</span>
          <h2>Gestão de usuários</h2>
          <p>
            Crie o usuário pelo e-mail, defina o perfil e as empresas permitidas. Depois você pode
            editar esses acessos a qualquer momento.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setCreated(null);
            setError("");
            setOpen(true);
          }}
        >
          <UserPlus size={16} /> Criar usuário
        </button>
      </section>
      {error && !open ? <div className="form-error">{error}</div> : null}
      <section className="user-kpis">
        <article>
          <Users size={18} />
          <div>
            <strong>{users.length}</strong>
            <span>Usuários cadastrados</span>
          </div>
        </article>
        <article>
          <Shield size={18} />
          <div>
            <strong>{users.filter((item) => item.status === "active").length}</strong>
            <span>Acessos ativos</span>
          </div>
        </article>
        <article>
          <Link2 size={18} />
          <div>
            <strong>{pendingInvites.length}</strong>
            <span>Cadastros pendentes</span>
          </div>
        </article>
      </section>
      <section className="panel data-panel">
        <div className="filter-bar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar usuário"
            />
          </div>
        </div>
        <div className="expense-table-wrap">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Empresas permitidas</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small className="table-subline">{item.email}</small>
                  </td>
                  <td>
                    <span className={`role-badge ${ROLE_CLASS[item.role]}`}>
                      {ROLE_LABEL[item.role]}
                    </span>
                  </td>
                  <td>
                    <CompanyChips ids={item.companyIds} companies={companies} />
                  </td>
                  <td>
                    <span className={`user-status ${item.status}`}>
                      <i /> {item.status === "active" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>{formatDate(item.created)}</td>
                  <td>
                    <div className="user-row-actions">
                      <button className="secondary-button" type="button" onClick={() => startUserEdit(item)}>
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        className={cls("switch-button", item.status === "active" && "on")}
                        disabled={item.id === currentUserId}
                        onClick={() => onToggle(item.id)}
                      >
                        <i /> {item.status === "active" ? "Ativo" : "Inativo"}
                      </button>
                      <button
                        className="danger-text-button"
                        type="button"
                        disabled={item.id === currentUserId}
                        onClick={() =>
                          setConfirmRevoke({
                            kind: "user",
                            id: item.id,
                            label: item.name,
                          })
                        }
                      >
                        <Trash2 size={14} /> Excluir acesso
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel invitation-panel">
        <header>
          <h3>Cadastros pendentes</h3>
        </header>
        {pendingInvites.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum cadastro pendente</strong>
            <span>Quando você criar um usuário, o link de senha aparece aqui até a pessoa finalizar.</span>
          </div>
        ) : (
          pendingInvites.map((item) => {
            const link = signupUrl(item.token);
            return (
              <div key={item.id}>
                <Mail size={18} />
                <span>
                  <strong>{item.email}</strong>
                  <small>
                    {ROLE_LABEL[item.role]} • Aguardando a pessoa cadastrar a senha
                  </small>
                  <div className="invitation-companies">
                    <CompanyChips ids={item.companyIds} companies={companies} />
                  </div>
                </span>
                <div className="invitation-actions">
                  <button className="secondary-button" type="button" onClick={() => startInviteEdit(item)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void copyLink(link, item.id)}
                  >
                    {copied === item.id ? <Check size={14} /> : <Copy size={14} />}
                    {copied === item.id ? "Link copiado" : "Copiar link"}
                  </button>
                  <button
                    className="danger-text-button"
                    type="button"
                    onClick={() =>
                      setConfirmRevoke({
                        kind: "invite",
                        id: item.id,
                        label: item.email,
                      })
                    }
                  >
                    <Trash2 size={14} /> Excluir convite
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {open ? (
        <div className="modal-layer">
          <button className="modal-overlay" onClick={closeModal} />
          {created ? (
            <div className="action-modal signup-share-modal">
              <header>
                <div className="modal-icon emerald">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3>Usuário criado</h3>
                  <p className="modal-lead">
                    {created.emailError
                      ? created.emailError
                      : `Envie o acesso para ${created.email}.`}
                  </p>
                </div>
              </header>
              <div className={cls("mail-status", "sent")}>
                Colaborador criado no diretório Pessoas desta intranet.
              </div>
              {created.link && created.link.includes("token=") && !created.link.endsWith("token=") ? (
              <div className="signup-link-box">
                <code>{created.link}</code>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void copyLink(created.link, "created")}
                >
                  {copied === "created" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "created" ? "Link copiado" : "Copiar link"}
                </button>
              </div>
              ) : (
              <p className="signup-link-hint">
                A pessoa entra na intranet com o e-mail e a senha inicial. Depois pode ser gerida em Pessoas.
              </p>
              )}
              <footer>
                <button className="secondary-button" type="button" onClick={closeModal}>
                  Fechar
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setCreated(null);
                    setEmail("");
                    setSelected([]);
                    setError("");
                    setCopied("");
                  }}
                >
                  Criar outro
                </button>
              </footer>
            </div>
          ) : (
            <form className="action-modal" onSubmit={handleCreate}>
              <header>
                <div className="modal-icon emerald">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3>Criar usuário</h3>
                  <p className="modal-lead">
                    Informe o e-mail, o perfil e as empresas. Depois copie o link para a pessoa
                    finalizar o cadastro.
                  </p>
                </div>
              </header>
              <label>
                E-mail <span>*</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Perfil
                <RoleSelect value={role} onChange={setRole} />
              </label>
              <CompanyPicker companies={companies} selected={selected} onChange={setSelected} />
              <AreaPicker role={role} selected={areas} onChange={setAreas} />
              {error ? <div className="form-error">{error}</div> : null}
              <footer>
                <button className="secondary-button" type="button" onClick={closeModal}>
                  Cancelar
                </button>
                <button className="primary-button" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : null}
                  {submitting ? "Criando..." : "Criar e gerar link"}
                </button>
              </footer>
            </form>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="modal-layer">
          <button className="modal-overlay" onClick={closeEdit} />
          <form className="action-modal" onSubmit={handleEdit}>
            <header>
              <div className="modal-icon emerald">
                <Pencil size={20} />
              </div>
              <div>
                <h3>{editingTitle}</h3>
                <p className="modal-lead">
                  Altere o perfil e as empresas permitidas. A mudança vale na próxima sessão da
                  pessoa.
                </p>
              </div>
            </header>
            {editing.kind === "user" ? (
              <label>
                E-mail
                <input value={editing.user.email} readOnly />
              </label>
            ) : (
              <label>
                E-mail
                <input value={editing.invitation.email} readOnly />
              </label>
            )}
            <label>
              Perfil
              <RoleSelect value={editRole} onChange={setEditRole} />
            </label>
            <CompanyPicker companies={companies} selected={editSelected} onChange={setEditSelected} />
            <AreaPicker role={editRole} selected={editAreas} onChange={setEditAreas} />
            {editError ? <div className="form-error">{editError}</div> : null}
            <footer>
              <button className="secondary-button" type="button" onClick={closeEdit}>
                Cancelar
              </button>
              <button className="primary-button" disabled={editSubmitting}>
                {editSubmitting ? <span className="spinner" /> : null}
                {editSubmitting ? "Salvando..." : "Salvar acessos"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {confirmRevoke ? (
        <div className="modal-layer">
          <button className="modal-overlay" onClick={() => !revoking && setConfirmRevoke(null)} />
          <div className="action-modal">
            <header>
              <div className="modal-icon">
                <Trash2 size={20} />
              </div>
              <div>
                <h3>Excluir acesso</h3>
                <p className="modal-lead">
                  {confirmRevoke.kind === "user"
                    ? `${confirmRevoke.label} deixa de entrar no ROM Flow. O histórico de solicitações permanece.`
                    : `O convite de ${confirmRevoke.label} será cancelado.`}
                </p>
              </div>
            </header>
            {error ? <div className="form-error">{error}</div> : null}
            <footer>
              <button
                className="secondary-button"
                type="button"
                disabled={revoking}
                onClick={() => setConfirmRevoke(null)}
              >
                Cancelar
              </button>
              <button className="danger-button" type="button" disabled={revoking} onClick={() => void handleRevoke()}>
                {revoking ? <span className="spinner" /> : null}
                {revoking ? "Excluindo..." : "Excluir acesso"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
