import { RequestHandler } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export const handleLeilao: RequestHandler = async (req, res) => {
  try {
    const body = req.body || {};
    console.log('[leilao] request body:', JSON.stringify(body));

    const scriptPath = path.resolve(process.cwd(), 'server/python/caixa_leilao.py');
    if (!fs.existsSync(scriptPath)) {
      console.error('[leilao] script not found at', scriptPath);
      return res.status(500).json({ error: 'Script not found', details: scriptPath });
    }

    const args: string[] = [scriptPath];

    if (body.modalidades) args.push('--modalidades', Array.isArray(body.modalidades) ? body.modalidades.join(',') : String(body.modalidades));
    if (body.cidades) args.push('--cidades', Array.isArray(body.cidades) ? body.cidades.join(',') : String(body.cidades));
    if (body.faixa_valor) args.push('--faixa_valor', String(body.faixa_valor));
    if (body.tipo_imovel) args.push('--tipo_imovel', String(body.tipo_imovel));
    if (body.quartos) args.push('--quartos', String(body.quartos));
    if (body.vagas) args.push('--vagas', String(body.vagas));
    if (body.area_util) args.push('--area_util', String(body.area_util));
    if (body.verificar_financiamento) args.push('--verificar_financiamento');

    // choose python binary — use only 'python' as requested
    const cmds = [
      { cmd: process.env.PYTHON_BIN || 'python', args },
    ];

    let lastErr: any = null;
    for (const c of cmds) {
      try {
        console.log('[leilao] trying python command:', c.cmd, c.args);
        const child = spawn(c.cmd, c.args ?? [], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => (stdout += d.toString()));
        child.stderr.on('data', d => (stderr += d.toString()));
        const code = await new Promise<number>((resolve, reject) => {
          child.on('error', (err) => reject(err));
          child.on('close', (code) => resolve(code ?? 0));
        });
        console.log('[leilao] child process exited with code:', code);
        if (stderr) console.log('[leilao] child stderr:', stderr);
        if (code !== 0) {
          lastErr = { code, stderr, stdout, used: c.cmd };
          continue;
        }
        let parsed: any = [];
        try {
          parsed = JSON.parse(stdout || '[]');
        } catch (pe) {
          console.error('[leilao] failed to parse stdout as JSON', pe, 'stdout:', stdout);
          lastErr = { parseError: String(pe), stdout, stderr, used: c.cmd };
          continue;
        }

        // The caixa script already returns a list of rows with keys like "Aceita Financiamento", "Foto", etc.
        return res.json({ results: parsed, logs: stderr, used: c.cmd });
      } catch (e: any) {
        console.error('[leilao] error running command', c.cmd, e);
        lastErr = { error: String(e?.message || e), used: c.cmd };
        continue;
      }
    }

    return res.status(500).json({ error: 'Failed to run caixa scraper', details: lastErr });
  } catch (err: any) {
    console.error('[leilao] unexpected error', err);
    return res.status(500).json({ error: 'Internal error', details: String(err?.message || err) });
  }
};
