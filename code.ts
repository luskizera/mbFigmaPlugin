// M3 Style to Variable - Versão Otimizada para Material 3 Design Kit

// Configuração do mapeamento
const STYLE_PREFIX = "M3/sys/light/";
const VARIABLE_PREFIX = "Schemes/";

// Função de conversão simples e direta
function convertStyleNameToVariableName(styleName: string): string {
  if (!styleName.startsWith(STYLE_PREFIX)) {
    return "";
  }
  
  // Remove o prefixo e converte o formato
  const token = styleName.slice(STYLE_PREFIX.length);
  const variableName = token
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return `${VARIABLE_PREFIX}${variableName}`;
}

// Cache para variables (evita múltiplas buscas)
let variableCache: Map<string, Variable> | null = null;

async function getVariableCache(): Promise<Map<string, Variable>> {
  if (!variableCache) {
    variableCache = new Map();
    const allVariables = await figma.variables.getLocalVariablesAsync();
    
    allVariables
      .filter(v => v.resolvedType === 'COLOR' && v.name.startsWith(VARIABLE_PREFIX))
      .forEach(v => variableCache!.set(v.name, v));
  }
  
  return variableCache;
}

// Contador de styles para o UI (CORRIGIDO)
async function countColorStyles(selection: readonly SceneNode[]): Promise<number> {
  let count = 0;
  
  async function countInNode(node: SceneNode) {
    if ('fillStyleId' in node && node.fillStyleId && typeof node.fillStyleId === 'string') {
      const style = await figma.getStyleByIdAsync(node.fillStyleId);
      if (style?.type === 'PAINT' && style.name.startsWith(STYLE_PREFIX)) {
        count++;
      }
    }
    
    if ('strokeStyleId' in node && node.strokeStyleId && typeof node.strokeStyleId === 'string') {
      const style = await figma.getStyleByIdAsync(node.strokeStyleId);
      if (style?.type === 'PAINT' && style.name.startsWith(STYLE_PREFIX)) {
        count++;
      }
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        await countInNode(child);
      }
    }
  }
  
  for (const node of selection) {
    await countInNode(node);
  }
  return count;
}

// Função principal de conversão (CORRIGIDO)
async function convertStylesToVariables(selection: readonly SceneNode[]): Promise<{
  converted: number;
  failed: number;
  errors: string[];
}> {
  const variables = await getVariableCache();
  const result = {
    converted: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  async function processNode(node: SceneNode) {
    // Processar fills
    if ('fillStyleId' in node && node.fillStyleId && typeof node.fillStyleId === 'string') {
      const style = await figma.getStyleByIdAsync(node.fillStyleId);
      
      if (style?.type === 'PAINT' && style.name.startsWith(STYLE_PREFIX)) {
        const variableName = convertStyleNameToVariableName(style.name);
        const variable = variables.get(variableName);
        
        if (variable) {
          try {
            const fills = JSON.parse(JSON.stringify(node.fills));
            if (fills.length > 0) {
              fills[0] = figma.variables.setBoundVariableForPaint(
                fills[0],
                'color',
                variable
              );
              node.fills = fills;
              result.converted++;
            }
          } catch (e) {
            result.failed++;
            result.errors.push(`Failed to convert fill: ${style.name}`);
          }
        } else {
          result.failed++;
          if (!result.errors.includes(variableName)) {
            result.errors.push(`Variable not found: ${variableName}`);
          }
        }
      }
    }
    
    // Processar strokes
    if ('strokeStyleId' in node && node.strokeStyleId && typeof node.strokeStyleId === 'string') {
      const style = await figma.getStyleByIdAsync(node.strokeStyleId);
      
      if (style?.type === 'PAINT' && style.name.startsWith(STYLE_PREFIX)) {
        const variableName = convertStyleNameToVariableName(style.name);
        const variable = variables.get(variableName);
        
        if (variable) {
          try {
            const strokes = JSON.parse(JSON.stringify(node.strokes));
            if (strokes.length > 0) {
              strokes[0] = figma.variables.setBoundVariableForPaint(
                strokes[0],
                'color',
                variable
              );
              node.strokes = strokes;
              result.converted++;
            }
          } catch (e) {
            result.failed++;
            result.errors.push(`Failed to convert stroke: ${style.name}`);
          }
        } else {
          result.failed++;
          if (!result.errors.includes(variableName)) {
            result.errors.push(`Variable not found: ${variableName}`);
          }
        }
      }
    }
    
    // Processar filhos
    if ('children' in node) {
      for (const child of node.children) {
        await processNode(child);
      }
    }
  }
  
  for (const node of selection) {
    await processNode(node);
  }
  return result;
}

// Função auxiliar para verificar a seleção e notificar a UI
async function checkSelectionAndNotifyUI() {
    const selection = figma.currentPage.selection;
    const count = await countColorStyles(selection);
    
    figma.ui.postMessage({
      type: 'selection-update',
      count: count,
      hasSelection: selection.length > 0
    });
}

// Notifica a UI sobre mudanças na seleção em tempo real
figma.on('selectionchange', () => {
    checkSelectionAndNotifyUI();
});

// Mensagens da UI do plugin
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'check-selection') {
    await checkSelectionAndNotifyUI();
  }
  
  if (msg.type === 'convert') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'No elements selected'
      });
      return;
    }
    
    const result = await convertStylesToVariables(selection);
    
    // Enviar resultado para UI
    figma.ui.postMessage({
      type: 'conversion-complete',
      ...result
    });
    
    // Notificação do Figma
    if (result.failed === 0) {
      figma.notify(`✅ Successfully converted ${result.converted} color styles`);
    } else {
      figma.notify(`Converted: ${result.converted} | Failed: ${result.failed}`, {
        timeout: 5000
      });
    }
  }
  
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// UI HTML
figma.showUI(__html__, {
  width: 300,
  height: 250,
  title: "M3 Style to Variable"
});