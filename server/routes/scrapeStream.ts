import type { RequestHandler } from "express";
import { spawn } from "child_process";
import path from "path";

import { type Request, type Response } from "express";

interface ScrapeRequestBody {
  sites?: Record<string, boolean>;
  filtros?: Record<string, string>;
}

function buildArgs(body: ScrapeRequestBody) {
  const sites = body.sites || {};
  const filtros = body.filtros || {};
  const scriptPath = path.resolve(process.cwd(), "server/python/scraper.py");

  const args: string[] = [scriptPath, "--output", "json", "--stream"]; // enable streaming (NDJSON)

  for (const [k, v] of Object.entries(sites)) {
    if (v) args.push(`--${k}`);
  }
  const setArg = (k: string, v?: string) => {
    if (v !== undefined && v !== null && String(v).length > 0) {
      args.push(`--${k}`);
      args.push(String(v));
    }
  };
  setArg("quartos", filtros["quartos"]);
  setArg("valorMax", filtros["valorMax"]);
  setArg("valorMin", filtros["valorMin"]);
  setArg("areaMin", filtros["areaMin"]);
  setArg("areaMax", filtros["areaMax"]);
  setArg("vagas", filtros["vagas"]);
  setArg("banhos", filtros["banhos"]);
  setArg("cidade", filtros["cidade"]);
  setArg("tipo_imovel", filtros["tipo_imovel"]);
  setArg("endereco", filtros["endereco"]);

  return args;
}

export const handleScrapeStream: RequestHandler = async (req: Request, res: Response) => {
  // ensure CORS headers for preflight and streaming responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  console.log('[scrape-stream] incoming method', req.method);
  if (req.method === 'OPTIONS') {
    // respond to preflight
    res.status(204).end();
    return;
  }

  const body = (req.body || {}) as ScrapeRequestBody;
  console.log('[scrape-stream] body', JSON.stringify(body));

  // Build common filter args (no site flags here)
  const buildFilterArgs = (b: ScrapeRequestBody) => {
    const filtros = b.filtros || {};
    const args: string[] = ["--output", "json", "--stream"];
    const setArg = (k: string, v?: string) => {
      if (v !== undefined && v !== null && String(v).length > 0) {
        args.push(`--${k}`);
        args.push(String(v));
      }
    };
    setArg("quartos", filtros["quartos"]);
    setArg("valorMax", filtros["valorMax"]);
    setArg("valorMin", filtros["valorMin"]);
    setArg("areaMin", filtros["areaMin"]);
    setArg("areaMax", filtros["areaMax"]);
    setArg("vagas", filtros["vagas"]);
    setArg("banhos", filtros["banhos"]);
    setArg("cidade", filtros["cidade"]);
    setArg("tipo_imovel", filtros["tipo_imovel"]);
    setArg("endereco", filtros["endereco"]);
    return args;
  };

  const scriptPath = path.resolve(process.cwd(), "server/python/scraper.py");
  const filterArgs = buildFilterArgs(body);

  const prefer = process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim() ? [process.env.PYTHON_BIN] : [];
  const isWin = process.platform === "win32";
  const fallbacks = isWin ? ["python", "py", "python3"] : ["python3", "python"];
  const bins = [...prefer, ...fallbacks];

  // selected site flags in order
  const selectedSiteFlags = Object.entries(body.sites || {})
    .filter(([, v]) => !!v)
    .map(([k]) => `--${k}`);

  // setup NDJSON response
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  // Try running a single site with fallbacks; resolve when finished
  const runOneSiteWithFallbacks = async (siteFlag: string, preferredBin?: string): Promise<string> => {
    const tryBins = preferredBin ? [preferredBin] : bins;
    let lastErr: any = null;
    console.log(`[scrape-stream] Trying to spawn ${siteFlag} with bins:`, tryBins);
    console.log(`[scrape-stream] Script path: ${scriptPath}`);
    for (const bin of tryBins) {
      try {
        console.log(`[scrape-stream] Attempting to use bin: ${bin}`);
        await new Promise<void>((resolve, reject) => {
          const child = spawn(bin, [scriptPath, siteFlag, ...filterArgs], { stdio: ["ignore", "pipe", "pipe"] });
          let buffer = "";
          let stderrBuffer = "";
          child.stdout.on("data", (chunk) => {
            buffer += chunk.toString();
            let idxNL: number;
            while ((idxNL = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, idxNL).trim();
              buffer = buffer.slice(idxNL + 1);
              if (!line) continue;
              res.write(line + "\n");
            }
          });
          child.stderr.on("data", (chunk) => {
            stderrBuffer += chunk.toString();
            console.log(`[scrape-stream] Python stderr:`, chunk.toString());
          });
          child.on("error", (e) => {
            console.error(`[scrape-stream] Spawn error with ${bin}:`, e);
            reject(e);
          });
          child.on("close", (code) => {
            console.log(`[scrape-stream] Process closed with code ${code} for bin ${bin}`);
            if (code !== 0) {
              reject(new Error(`Process exited with code ${code}: ${stderrBuffer}`));
            } else {
              if (buffer.trim().length > 0) {
                res.write(buffer.trim() + "\n");
              }
              resolve();
            }
          });
        });
        console.log(`[scrape-stream] Success with bin: ${bin}`);
        return bin; // success
      } catch (e) {
        console.error(`[scrape-stream] Failed with bin ${bin}:`, e);
        lastErr = e;
        continue;
      }
    }
    throw lastErr || new Error("Failed to spawn python for site " + siteFlag);
  };

  try {
    if (selectedSiteFlags.length === 0) {
      res.end(JSON.stringify({ error: "No sites selected" }) + "\n");
      return;
    }

    // Run sites sequentially; reuse the first working python bin
    let workingBin: string | undefined = undefined;
    for (const siteFlag of selectedSiteFlags) {
      workingBin = await runOneSiteWithFallbacks(siteFlag, workingBin);
    }

    res.end();
  } catch (e: any) {
    res.end(JSON.stringify({ error: String(e?.message || e) }) + "\n");
  }
};
