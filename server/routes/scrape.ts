import type { RequestHandler } from "express";
import { spawn } from "child_process";
import path from "path";

interface ScrapeRequestBody {
  sites: {
    netimoveis?: boolean;
    casamineira?: boolean;
    imovelweb?: boolean;
    zapimoveis?: boolean;
    vivareal?: boolean;
    olx?: boolean;
    quintoandar?: boolean;
    loft?: boolean;
    chavesnamao?: boolean;
  };
  filtros?: {
    quartos?: string;
    valorMax?: string;
    valorMin?: string;
    areaMin?: string;
    areaMax?: string;
    vagas?: string;
    banhos?: string;
    cidade?: string;
    tipo_imovel?: string;
    endereco?: string;
    characteristics?: string;
    amenities?: string;
    location_options?: string;
    tour_virtual?: boolean;
    video?: boolean;
  };
}

function buildArgs(body: ScrapeRequestBody) {
  const sites = body.sites || {};
  const filtros = body.filtros || {};
  const scriptPath = path.resolve(process.cwd(), "server/python/scraper.py");

  const args: string[] = [scriptPath, "--output", "json"];
  (Object.keys(sites) as (keyof typeof sites)[]).forEach((key) => {
    if (sites[key]) args.push(`--${key}`);
  });

  const setArg = (k: string, v?: string) => {
    if (v !== undefined && v !== null && String(v).length > 0) {
      args.push(`--${k}`);
      args.push(String(v));
    }
  };

  setArg("quartos", filtros.quartos);
  setArg("valorMax", filtros.valorMax);
  setArg("valorMin", filtros.valorMin);
  setArg("areaMin", filtros.areaMin);
  setArg("areaMax", filtros.areaMax);
  setArg("vagas", filtros.vagas);
  setArg("banhos", filtros.banhos);
  setArg("cidade", filtros.cidade);
  setArg("tipo_imovel", filtros.tipo_imovel);
  setArg("endereco", filtros.endereco);
  setArg("characteristics", filtros.characteristics);
  setArg("amenities", filtros.amenities);
  setArg("location_options", filtros.location_options);
  if (filtros.tour_virtual) args.push("--tour_virtual");
  if (filtros.video) args.push("--video");

  return args;
}

async function runWithFallbacks(cmds: { cmd: string; args?: string[] }[]) {
  let lastError: any = null;
  for (const c of cmds) {
    try {
      const res = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(c.cmd, c.args ?? [], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", (err) => reject(err));
        child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
      });
      return { ...res, used: c.cmd };
    } catch (e) {
      lastError = e;
      continue; // try next
    }
  }
  throw lastError ?? new Error("Failed to spawn any python command");
}

export const handleScrape: RequestHandler = async (req, res) => {
  try {
    const body = (req.body || {}) as ScrapeRequestBody;
    const args = buildArgs(body);

    const preferred = process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim().length > 0
      ? [{ cmd: process.env.PYTHON_BIN, args }]
      : [];

    const isWin = process.platform === "win32";
    const defaults = isWin
      ? [
          { cmd: "python", args },
          { cmd: "py", args: ["-3", ...args] },
          { cmd: "python3", args },
        ]
      : [
          { cmd: "python3", args },
          { cmd: "python", args },
        ];

    const { code, stdout, stderr, used } = await runWithFallbacks([...preferred, ...defaults]);

    if (code !== 0) {
      return res.status(500).json({ error: "Scraper exited with error", code, stderr, used });
    }

    // Parse JSON output
    const parsed = JSON.parse(stdout || "[]");
    const results = (parsed as any[]).map((row, idx) => {
      let site = row.site || row.Site || "";
      if (!site && row.link) {
        try {
          const u = new URL(row.link);
          site = u.hostname.replace(/^www\./, "");
        } catch {}
      }
      return {
        id: Buffer.from(String(row.link || idx)).toString("base64").replace(/=+$/g, ""),
        nome: row.nome || row.Nome || row.titulo || "Imóvel",
        imagem: row.imagem || row.Imagem || row.image || "",
        valor: row.valor || row.Valor || "",
        m2: row.m2 || row["M²"] || row.area || "",
        localizacao: row.localizacao || row["Localização"] || row.local || row.endereco || "",
        link: row.link || row.url || "",
        quartos: row.quartos || "",
        garagem: row.garagem || "",
        banhos: row.banhos || row.Banhos || row.banheiros || "",
        site,
      };
    });

    res.json({ results, logs: stderr, used });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to run scraper", details: String(e?.message || e) });
  }
};
