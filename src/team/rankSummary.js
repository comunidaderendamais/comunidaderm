import { calcUsedRankVolumeFromLegRows } from './teamEngine.js';

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/**
 * Contrato de semantica de rank no frontend.
 *
 * Regras:
 * - `rank.volume` representa o volume util/exibido do rank atual.
 *   Este valor ja considera a trava por perna quando o rank atual exige cap.
 * - `rank.progressVolume` representa o volume bruto ponderado da rede.
 *   Este valor serve para leitura operacional/progresso antes da trava final.
 * - Telas nao devem acessar `summary.rank.volume` ou `summary.rank.progressVolume`
 *   diretamente. O consumo deve passar pelos helpers abaixo.
 *
 * Anti-padrao documentado:
 * - Ler campos crus de `summary.rank.*` na UI cria divergencia entre Home,
 *   equipe, bonus e Admin.
 */
export const getCurrentRankDisplayVolume = (summary) => {
  const legs = Array.isArray(summary?.legs) ? summary.legs : [];
  return toNumber(
    summary?.rank?.volume ??
      summary?.usedVolume ??
      calcUsedRankVolumeFromLegRows(legs, summary?.rank?.key)
  );
};

export const getCurrentRankProgressVolume = (summary) =>
  toNumber(summary?.rank?.progressVolume ?? getCurrentRankDisplayVolume(summary));

// Compatibilidade temporaria com chamadas antigas enquanto a base converge.
export const getDisplayedRankVolume = getCurrentRankDisplayVolume;
export const getDisplayedRankProgressVolume = getCurrentRankProgressVolume;
