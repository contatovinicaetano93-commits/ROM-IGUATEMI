# Graph Report - ROM-IGUATEMI  (2026-07-14)

## Corpus Check
- 185 files · ~158,559 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1007 nodes · 2948 edges · 66 communities (55 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c62b1cdd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]

## God Nodes (most connected - your core abstractions)
1. `getSql()` - 86 edges
2. `ok()` - 79 edges
3. `handleError()` - 68 edges
4. `err()` - 61 edges
5. `getBrand()` - 53 edges
6. `logEvent()` - 27 edges
7. `listServices()` - 21 edges
8. `syncAttendances()` - 20 edges
9. `fetchAllAvecReport()` - 19 edges
10. `pick()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `err()`  [INFERRED]
  src/app/api/contacts/[id]/route.ts → src/lib/api-response.ts
- `GET()` --calls--> `handleError()`  [INFERRED]
  src/app/api/contacts/[id]/route.ts → src/lib/api-response.ts
- `GET()` --calls--> `ok()`  [INFERRED]
  src/app/api/contacts/[id]/route.ts → src/lib/api-response.ts
- `GET()` --calls--> `listEvents()`  [INFERRED]
  src/app/api/contacts/[id]/route.ts → src/lib/contacts.ts
- `GET()` --calls--> `setPreferredHairstylist()`  [INFERRED]
  src/app/api/contacts/[id]/route.ts → src/lib/contacts.ts

## Import Cycles
- None detected.

## Communities (66 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (32): asRecord(), EVENT_ALIASES, ingestAvecWebhook(), normalizeAvecWebhookBody(), NormalizedAvecWebhook, pickNested(), pickRaw(), pickStr() (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (34): Account, AuthOptions, AuthRole, AuthSession, canViewRevenue(), createSessionToken(), getAdminPassword(), getAdminUser() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (30): reactivationCsv(), returnCompareCsv(), revenueCompareCsv(), deliverDirectorReport(), managementChatId(), getDirectorReportRecipients(), html0011(), html0021() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (33): computeDurationMinutes(), normalize0011ReactivationRow(), normalizeAppointmentRow(), normalizeAttendanceRow(), normalizeCancellationRow(), normalizeClientRow(), Normalized0011Client, NormalizedAvecAppointment (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (30): createSchema, GET(), POST(), createSchema, GET(), monthRangeFromKey(), POST(), requireFinance() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (31): dependencies, @anthropic-ai/sdk, exceljs, lucide-react, @neondatabase/serverless, next, react, react-dom (+23 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (21): GET(), POST(), GET(), GET(), err(), handleError(), ok(), requireAuth() (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (27): buildDirectorReport(), BuildDirectorReportOptions, comparisonMonthSet(), buildDaniReactivation(), buildMockReturnBlocks(), buildMockRevenueBlocks(), buildMonthsForPro(), buildQuartersForPro() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (21): isProduction(), listTodayScheduleForProfessional(), headerSecret(), isTelegramChatAllowed(), verifyAvecWebhook(), verifyTelegramStaffWebhook(), verifyTelegramWebhook(), verifyWhatsAppWebhook() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (19): computeRecommendations(), EnrichedService, Recommendation, RecommendationType, ServiceState, AddServiceInput, ClientService, ClientStats (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (27): fetchAllAvecReport(), periodRange(), guessServiceCategory(), isHairService(), isNailService(), AvecSyncRun, beginAvecSyncRun(), findOrCreateService() (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (19): brand, geistMono, geistSans, metadata, viewport, AdminSessionBar(), Session, AppShell() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (21): askAI(), fallbackReply(), getAiModel(), getClient(), isAiConfigured(), briefPrompt(), buildRuleBrief(), generateBrief() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (20): getLastAvecSync(), recordSyncRun(), GET(), getSql(), listUpcomingSchedules(), buildSalonContext(), SalonContext, computeSalonIntelligence() (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (18): LastVisitCard(), LastVisitData, ClientStats, Contact, ContactDetailPage(), ContactEvent, eventMeta(), HANDLED_BY_LABEL (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (21): Ctx, GET(), derivePreferredPro(), GET(), isUnsetPreference(), patchSchema, ServiceHint, CONTACT_STATUSES (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (19): requireSession(), createPillar(), createVideo(), CreateVideoInput, deactivateVideo(), listPillars(), listVideos(), OnboardingPillar (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (18): fmtAvecDate(), getAvecReportRegistry(), avg(), buildQuarterRow(), daysSince(), fetch0011Quarter(), fetch0021Month(), fetchLiveDirectorBlocks() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (18): Avec (opcional webhook push), Criar repositório no GitHub (se ainda não existe), Isolamento, Passo 1 — Neon, Passo 2 — Vercel, Passo 3 — Domínio, Passo 4 — Primeiro uso, Passo 5 — Integrações (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (16): normalizeP1AcquisitionRow(), normalizeP1OccupancyRow(), AvecMapperKind, AvecReportDef, AvecReportTier, AvecSyncMode, CORE, getDailyReports() (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (15): schema, serviceSchema, ContactListItem, listContactsWithSummary(), Channel, ContactEventRow, ContactRow, getContactByAvecId() (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.19
Nodes (12): matchDirectorProfessional(), normalizeProKey(), pros, BRASIL_DIRECTOR_PROFESSIONALS, IGUATEMI_DIRECTOR_PROFESSIONALS, listDirectorProfessionals(), ROSTERS, DirectorProfessional (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (11): Avatar(), CHANNEL_LABEL, PrimaryButton(), STATUS_LABEL, STATUS_TONE, StatusPill(), Contact, CATEGORY_LABEL (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (10): AdminPage(), AvecStatus, ContactRow, fmtIso(), HealthStatus, KpiData, LoadState, ScheduleRow (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (15): addCalendarDays(), assertAvecMockAllowed(), AVEC_REPORT_LABELS, AvecReportFetchResult, AvecReportParams, extractRows(), fetchAvecReport(), fmtBrFromYmd() (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (14): normalizeP3NewClientsRow(), normalizeP3ReturnRateRow(), getLatestSnapshot(), saveReportSnapshot(), asRows(), resolveId(), snapshotSafe(), syncP3Kpis() (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (14): normalizeP2BirthdayRow(), normalizeP2ChannelRow(), normalizeP2RatingRow(), asRows(), resolveId(), snapshotSafe(), syncP2Kpis(), SyncStatsLike (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (13): HealthItem(), InfoBanner(), ActionItem, aggregateByChannel(), aggregateByDay(), AvecStatus, DashboardPage(), KpiData (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.23
Nodes (12): listEvents(), normalizeSearchText(), formatCatalogForPrompt(), SALON_CATALOG, buildSystemPrompt(), formatHistory(), handleWhatsAppMessage(), isAwaitingHuman() (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (9): buildMonthOptions(), buildQuarterOptions(), defaultMonthKey(), defaultQuarterKey(), MONTH_LABELS, MONTHS, QUARTERS, spNowParts() (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.24
Nodes (13): emptyMonthRow(), labelMonth(), monthsInQuarter(), fetchTmComparison(), monthKeyFromDate(), monthRange(), previousMonthKey(), previousQuarterKey() (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.23
Nodes (12): buildRecallWhatsAppMessage(), buildClientWhatsAppMessage(), ClientMessageContact, ClientMessageService, daysSince(), firstName(), formatVisitDate(), inferInterest() (+4 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (10): DeltaTag(), currentMonthKey(), FinanceCategory, FinanceExpense, FinanceiroPage(), FinanceKpiBucket, FinanceKpis, fmtDelta() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.23
Nodes (12): addDays(), GET(), ProfessionalWithDelta, ensureSalonP1Table(), getLatestSalonP1Daily(), getSalonP1Daily(), getSalonP1DailyNear(), P1AcquisitionRow (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (8): Ctx, POST(), requireAdmin(), anonymizeContact(), purgeInactiveContacts(), PurgeResult, GET(), POST()

### Community 36 - "Community 36"
Cohesion: 0.23
Nodes (8): BriefSheet(), BriefSheetProps, CountBadge(), HojeData, HojePage(), PlaybookItem, ScheduleItem, apiFetch()

### Community 37 - "Community 37"
Cohesion: 0.26
Nodes (10): allMonthsUpTo(), fetchProfessionalProfileMonths(), aggregateQuarterRevenue(), quarterOfMonth(), MonthRevenueRow, buildProfessionalProfileWorkbook(), groupByYear(), MONTH_PT (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.38
Nodes (7): AvecSyncMode, isCronAuthorized(), authorize(), executeSync(), GET(), parseMode(), POST()

### Community 39 - "Community 39"
Cohesion: 0.27
Nodes (9): AvecSyncStats, RomPanelId, DeploymentContext, deploymentLabel(), DeploymentValidation, getDeploymentContext(), readPublicPanel(), readServerPanel() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.42
Nodes (9): returnCsv(), revenueCsv(), isDirectorEmailConfigured(), asMonth(), asQuarter(), asStage(), GET(), POST() (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (8): GET(), getRomPanelId(), parseRomPanelId(), envOk(), getHealthStatus(), getPublicHealthStatus(), probeDatabase(), probeKpiLayers()

### Community 42 - "Community 42"
Cohesion: 0.31
Nodes (6): defaultProductionHost(), EvolutionApiAdapter, getWhatsAppAdapter(), WhatsAppAdapter, getFinanceReminderNumbers(), sendFinanceReminder()

### Community 43 - "Community 43"
Cohesion: 0.28
Nodes (5): isEmbedUrl(), OnboardingPage(), OnboardingPillar, OnboardingVideo, toEmbedUrl()

### Community 44 - "Community 44"
Cohesion: 0.32
Nodes (6): HealthForSetup, PRIORITY_LABEL, SetupChecklist(), isItemConfigured(), SETUP_ITEMS, SetupItem

### Community 45 - "Community 45"
Cohesion: 0.39
Nodes (7): isAvecConfigured(), FAST_EVENTS, FULL_EVENTS, internalBaseUrl(), postSync(), runAvecWebhookSideEffects(), scheduleAvecWebhookSideEffects()

### Community 46 - "Community 46"
Cohesion: 0.48
Nodes (6): getMockReport(), MOCK_CLIENTS, mockAppointments(), mockAttendances(), mockCancellations(), mockRevenue()

### Community 47 - "Community 47"
Cohesion: 0.57
Nodes (5): normalizePhone(), isFromMe(), jidToPhone(), parseWhatsAppPayload(), pickText()

### Community 48 - "Community 48"
Cohesion: 0.52
Nodes (6): CachedBrief, getCachedBrief(), isCacheUnavailableError(), resolveBriefCache(), setCachedBrief(), hashContactContext()

## Knowledge Gaps
- **243 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+238 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getBrand()` connect `Community 2` to `Community 0`, `Community 32`, `Community 36`, `Community 37`, `Community 39`, `Community 8`, `Community 41`, `Community 42`, `Community 11`, `Community 12`, `Community 13`, `Community 49`, `Community 24`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `getSql()` connect `Community 13` to `Community 0`, `Community 34`, `Community 35`, `Community 4`, `Community 6`, `Community 8`, `Community 41`, `Community 10`, `Community 9`, `Community 12`, `Community 15`, `Community 16`, `Community 48`, `Community 21`, `Community 26`, `Community 27`, `Community 29`, `Community 31`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `ok()` connect `Community 6` to `Community 0`, `Community 1`, `Community 34`, `Community 35`, `Community 4`, `Community 38`, `Community 40`, `Community 41`, `Community 8`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 21`, `Community 31`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `ok()` (e.g. with `GET()` and `PATCH()`) actually correct?**
  _`ok()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `handleError()` (e.g. with `GET()` and `PATCH()`) actually correct?**
  _`handleError()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `err()` (e.g. with `GET()` and `PATCH()`) actually correct?**
  _`err()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _243 weakly-connected nodes found - possible documentation gaps or missing edges._