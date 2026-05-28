import { useEffect, useState } from 'react';
import TeamOverviewSection from '../team/TeamOverviewSection.jsx';
import TeamNetworkLevelsCard from '../team/TeamNetworkLevelsCard.jsx';
import { fetchMyNetwork, fetchMyTeamSummary } from '../supabase/dashboardRepo.js';
import { getT, translateRankTitle } from '../i18n/i18n.js';
import { calcUsedRankVolumeFromLegRows } from '../team/teamEngine.js';

export default function TeamView({ user, lang, onOpenApn }) {
  const t = getT(lang);
  const [summary, setSummary] = useState(null);
  const [networkLevels, setNetworkLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedRefLink, setCopiedRefLink] = useState(false);
  const refLink = `https://comunidaderm.com/ref/${user?.username || 'user'}`;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const [summaryRes, networkRes] = await Promise.all([fetchMyTeamSummary({ maxDepth: 5 }), fetchMyNetwork({ maxDepth: 5 })]);
      if (cancelled) return;
      setSummary(summaryRes.ok ? summaryRes.summary : null);
      setNetworkLevels(networkRes.ok ? networkRes.levels : []);
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const rankTitle = translateRankTitle(summary?.rank?.title || 'Ferro', t);
  const directVol = Number(summary?.directVolume || 0);
  const indirectVol = Number(summary?.indirectVolume || 0);
  const residualTotal = Number(user?.balances?.teamEarnings || 0);
  const te1 = Number(summary?.entryFee?.level1 || 0);
  const te2 = Number(summary?.entryFee?.level2 || 0);
  const te3 = Number(summary?.entryFee?.level3 || 0);
  const legs = Array.isArray(summary?.legs) ? summary.legs : [];
  const currentRankVolume = Number(
    summary?.usedVolume ?? calcUsedRankVolumeFromLegRows(legs, summary?.rank?.key)
  );
  const nextRank = summary?.rank?.next || null;
  const networkSource =
    Array.isArray(networkLevels) && networkLevels.some((level) => Array.isArray(level?.users) && level.users.length > 0)
      ? networkLevels
      : {
          ...(summary || {}),
          teamState: user?.teamState || summary?.teamState || summary?.team_state || {},
        };

  const handleCopyRefLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopiedRefLink(true);
      window.setTimeout(() => setCopiedRefLink(false), 1800);
    } catch {
      setCopiedRefLink(false);
    }
  };

  const handleOpenPresentation = () =>
    onOpenApn?.({
      page: 10,
      title: `${t.apnPresentation} • ${t.apnTeamEarnings}`,
      shortcuts: [
        { label: t.apnTeamEarnings, page: 10 },
        { label: t.apnResidual, page: 11 },
      ],
    });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <TeamOverviewSection
        t={t}
        rankTitle={rankTitle}
        directVol={directVol}
        indirectVol={indirectVol}
        residualTotal={residualTotal}
        entryFee={{ level1: te1, level2: te2, level3: te3 }}
        legs={legs}
        currentRankVolume={currentRankVolume}
        nextRank={nextRank}
        loading={loading}
        copied={copiedRefLink}
        onCopyRefLink={handleCopyRefLink}
        onOpenPresentation={handleOpenPresentation}
      />
      <TeamNetworkLevelsCard t={t} lang={lang} levels={networkSource} />
    </div>
  );
}
