function getSection(sections, key) {
    return sections.find((section) => section.key === key);
}

const POSENC_DEF = `import torch
import math

class PositionalEncoding(torch.nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)   # even dims
        pe[:, 1::2] = torch.cos(position * div_term)   # odd dims
        pe = pe.unsqueeze(0)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        pe = self.pe[:, :x.shape[-2], :].type_as(x)  # (1, seq_len, d_model), same dtype & device
        return x + pe`

class CodeGenerator {
    constructor(sections, wizardState) {
        this.wires = getSection(sections, 'wires').items
        this.boxes = getSection(sections, 'boxes').items
        this.equations = getSection(sections, 'equations').items
        this.diagrams = getSection(sections, 'diagrams').items
        this.wizardState = wizardState
        this.blocks = [""]
        this.indent = 0
        this.nameDups = {}
        this.nameCache = {}
    }

    getName(type, name) {
        if (this.nameCache[type] !== undefined) {
            return this.nameCache[type] 
        }

        let normalized = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[0-9]/, "_$&")
        let newname;
        if (this.nameDups[normalized] !== undefined) {
            this.nameDups[normalized] += 1
            newname = `${normalized}_${this.nameDups[normalized]}`
        } else {
            this.nameDups[normalized] = 0
            newname = normalized
        }

        const banned = ['loss', 'lhs', 'rhs', 'equation', 'learned']
        if (!banned.every((prefix) => !newname.startsWith(prefix))) {
            newname = `_${newname}`
        }

        this.nameCache[type] = newname
        return newname
    }

    addLine(line, marker) {
        let indent = marker ? marker[0] : this.indent
        let nline = line.split("\n").map((subline) => ' '.repeat(indent) + subline).join("\n") + '\n'
        if (marker === undefined) {
            this.blocks[this.blocks.length - 1] += nline
        } else {
            this.blocks[marker[2]] = this.blocks[marker[2]].slice(0, marker[1]) + nline + this.blocks[marker[2]].slice(marker[1])
        }
    }

    getMarker() {
        return [this.indent, this.blocks[this.blocks.length - 1].length, this.blocks.length - 1]
    }

    beginBlock() {
        this.indent += 4
    }

    endBlock() {
        this.indent -= 4
    }

    sectionBreak() {
        this.blocks.push("")
    }

    lineBreak() {
        this.addLine("")
    }

    getPython() {
        this.generate()
        return this.blocks.join("\n")
    }

    getNotebook() {
        this.generate()
        let nb = {
            cells: this.blocks.map((block) => { return {
                "cell_type": "code",
                "execution_count": null,
                "metadata": {},
                "outputs": [],
                "source": block.trimEnd()
            }}),
            metadata: {
                "language_info": {
                    "name": "Python"
                }
            },
            nbformat: 4,
            nbformat_minor: 5,
        }
        return JSON.stringify(nb, null, 4)
    }

    generate() {
        this.preamble()
        this.sectionBreak()

        for (let box of this.boxes) {
            this.defineBox(box)
        }

        let equations = []
        let allInputs = new Set()
        for (let equation of this.equations) {
            let eq = this.processEquation(equation)
            equations.push(eq)
            allInputs = allInputs.union(new Set(eq.inputs))
            this.sectionBreak()
        }
        allInputs = Array.from(allInputs).sort()

        this.addLine(`def loss_function(${allInputs.join(", ")}):`)
        this.beginBlock()
        this.addLine(`loss = ${equations.map((eq) => {
            let weightVal = this.wizardState.outputWeights[eq.type]
            let weight = weightVal !== '1' ? `${weightVal}*` : ''
            return `${weight}${eq.name}(${eq.inputs.join(", ")})`
        }).join(" + ")}`)
        this.addLine(`return loss`)
        this.endBlock()
        this.sectionBreak()

        this.generateInstances(new Set(allInputs))
    }

    preamble() {
        if (!Object.entries(this.wizardState.learnerConfigs).every(([_, value]) => value.arch !== 'Transformer')) {
            this.addLine(POSENC_DEF)
        } else {
            this.addLine('import torch')
        }
    }

    generateInstances(allInputs) {
        for (let box of this.boxes) {
            let boxName = this.getName(box.type, box.label)
            let learnerName = `learned${boxName}`
            if (box.kind === 'learner' && allInputs.has(learnerName)) {
                this.addLine(`${learnerName} = ${boxName}()`)
            }
        }
        this.addLine("# Your training code here!")
    }

    defineBox(box) {
        let boxName = this.getName(box.type, box.label)
        if (box.kind === 'fixed') {
            this.addLine(`def ${boxName}(${box.inputs.map((_, i) => `input${i}`).join(", ")}):`)
            this.beginBlock()
            this.addLine("# Your code here!")
            if (box.outputs.length !== 1) {
                for (let i = 0; i < box.outputs.length; i++) {
                    this.addLine(`output${i} = _`)
                }
                this.addLine(`return (${box.outputs.map((_, i) => `output${i}`).join(", ")})`)
            } else {
                this.addLine(`output = _`)
                this.addLine(`return output`)
            }
            this.endBlock()
            this.sectionBreak()
        } else if (box.kind == 'learner') {
            this.addLine(`class ${boxName}(torch.nn.Module):`)
            this.beginBlock()

            this.addLine("def __init__(self):")
            this.beginBlock()
            this.addLine("super().__init__()")
            let inputDim = box.inputs
                .map((inp) => Number.parseInt(this.wizardState.wireDims[inp]))
                .reduce((p,a) => p+a, 0)
            let outputDim = box.outputs
                .map((inp) => Number.parseInt(this.wizardState.wireDims[inp]))
                .reduce((p,a) => p+a, 0)

            if (inputDim === 0) {
                this.addLine(`self.model = torch.nn.Parameter(torch.randn(${outputDim}))`)
            } else if (outputDim !== 0) {
                if (this.wizardState.learnerConfigs[box.type].arch === 'Linear') {
                    this.addLine(`self.model = torch.nn.Linear(${inputDim}, ${outputDim})`)
                } else if (this.wizardState.learnerConfigs[box.type].arch === 'MLP') {
                    let mlp = this.wizardState.learnerConfigs[box.type].mlp
                    let activationFunc = {
                        "relu": "torch.nn.ReLU",
                        "tanh": "torch.nn.Tanh",
                        "sigmoid": "torch.nn.Sigmoid"
                    }[mlp.activation]
                    this.addLine(`self.model = torch.nn.Sequential(`)
                    this.beginBlock()
                    this.addLine(`torch.nn.Linear(${inputDim}, ${mlp.hiddenUnits}),`)
                    this.addLine(`${activationFunc}(),`)
                    for (let i = 0; i < mlp.hiddenLayers; i++) {
                        this.addLine(`torch.nn.Linear(${mlp.hiddenUnits}, ${outputDim}),`)
                        this.addLine(`${activationFunc}(),`)
                    }
                    this.addLine(`torch.nn.Linear(${mlp.hiddenUnits}, ${outputDim})`)
                    this.endBlock()
                    this.addLine(`)`)   
                } else if (this.wizardState.learnerConfigs[box.type].arch === 'Transformer') {
                    let transformer = this.wizardState.learnerConfigs[box.type].transformer
                    this.addLine(`layer = torch.nn.TransformerEncoderLayer(
    d_model=${transformer.dModel},
    nhead=${transformer.numHeads},
    dim_feedforward=${transformer.dff},
    dropout=${transformer.dropout},
    batch_first=True
)`)
                    this.addLine(`self.model = torch.nn.Sequential(`)
                    this.beginBlock()
                    this.addLine(`torch.nn.Linear(${inputDim}, ${transformer.dModel}),`)
                    this.addLine(`PositionalEncoding(${transformer.dModel}),`)
                    this.addLine(`torch.nn.TransformerEncoder(layer, num_layers=${transformer.numLayers}),`)
                    this.addLine(`torch.nn.Linear(${transformer.dModel}, ${outputDim})`)
                    this.endBlock()
                    this.addLine(')')
                }
            }
            this.endBlock()
            this.lineBreak()

            this.addLine(`def forward(self, ${box.inputs.map((_, i) => `input${i}`).join(", ")}):`)
            this.beginBlock()
            if (outputDim === 0) {
                this.addLine("return")
            } else if (inputDim === 0) {
                this.addLine("return self.model")
            } else {
                if (box.inputs.length === 1) {
                    this.addLine("flattened = input0")
                } else {
                    this.addLine(`flattened = torch.cat([${box.inputs.map((_, i) => `input${i}`).join(", ")}], dim=-1)`)
                }
                this.addLine(`output = self.model(flattened)`)
                if (box.outputs.length !== 1) {
                    let idx = 0
                    box.outputs.forEach((out, i) => {
                        let size = Number.parseInt(this.wizardState.wireDims[out])
                        this.addLine(`output${i} = output[..., ${idx}:${idx+size}]`)
                        idx += size
                    })
                    this.addLine(`return (${box.outputs.map((_, i) => `output${i}`).join(", ")})`)
                } else {
                    this.addLine("return output")
                }
            }
            this.endBlock()

            this.endBlock()
            this.sectionBreak()
        }
    }

    processEquation(equation) {
        let lhs = this.diagrams.find((diagram) => diagram.type == equation['lhs-type'])
        let rhs = this.diagrams.find((diagram) => diagram.type == equation['rhs-type'])
        let eqname = this.getName(equation.type, equation.label)
        let undetached = this.wizardState.outputLearners[equation.type]

        let outputTypes = lhs.nodes.filter((node) => {
            return this.boxes.find((box) => box.type === node.data.type).kind == 'output'
        }).map((node) => node.data.type)

        let marker = this.getMarker()
        this.beginBlock()
        let inputsL = this.writeDiagramBlock(lhs, undetached, outputTypes, 'lhs')
        this.lineBreak()
        let inputsR = this.writeDiagramBlock(rhs, undetached, outputTypes, 'rhs')
        this.lineBreak()
        let inputs = Array.from(inputsL.union(inputsR)).sort()
        this.addLine(`def ${eqname}(${inputs.join(', ')}):`, marker)

        let lossVal = outputTypes.map((ty, i) => {
            let outputBox = this.boxes.find((box) => box.type == ty)
            let iidx = outputTypes.length !== 1 ? `[${i}]` : ''
            return outputBox.inputs.map((_, j) => {
                let loss = this.wizardState.outputLosses[equation.type][ty][j]
                let lossFn = {
                    'L2': 'torch.nn.functional.mse_loss',
                    'L1': 'torch.nn.functional.l1_loss',
                    'BCE': 'torch.nn.functional.binary_cross_entropy',
                    'CE': 'torch.nn.functional.cross_entropy'
                }[loss];
                let jidx = outputBox.inputs.length !== 1 ? `[${j}]` : ''
                return `${lossFn}(lhs${iidx}${jidx}, rhs${iidx}${jidx})`
            }).join(" + ")
        }).join(" + ")
        this.addLine(`loss = ${lossVal}`)
        this.addLine("return loss")
        this.endBlock()

        return { type: equation.type, name: eqname, inputs }
    }

    writeDiagramBlock(diagram, undetached, outputTypes, outVar) {
        let outputVars = {}
        let nodeVars = {}
        let nodeTypDups = {}
        let shouldDetach = {}
        let isTuple = {}
        let equationInputs = new Set()

        // Topological sort of the nodes
        let stack = diagram.nodes.filter((node) => diagram.edges.every((edge) => edge.target != node.id))
        let visitedNodes = new Set(stack.map((node) => node.id))
        while (stack.length > 0) {
            // Find the box for this node
            let node = stack.shift()
            let box = this.boxes.find((box) => box.type == node.data.type)
            let boxName = this.getName(box.type, box.label)
            // If it is a learner that is not undetached, then it should be detached
            shouldDetach[node.id] = (box.kind === 'learner') && (undetached.find((t) => t == box.type) === undefined)
            
            // Find all the inputs to this node, and sort them in order of input handle:
            let inputs = diagram.edges
                .filter((edge) => edge.target == node.id)
                .map((edge) => { return { 
                    id: edge.source, 
                    idx: Number.parseInt(edge.sourceHandle.slice(4)), 
                    arg: Number.parseInt(edge.targetHandle.slice(3)) 
                }})
                .sort((a, b) => a.arg - b.arg)
                .map((inp) => {
                    let idx = isTuple[inp.id] ? `[${inp.idx}]` : ''
                    let detach = shouldDetach[inp.id] ? '.detach()' : ''
                    return `${nodeVars[inp.id]}${idx}${detach}`
                })

            if (box.kind === 'output') {
                // If it's an output, record the variable to return later
                outputVars[box.type] = boxName
                // Aggregate all outputs in a tuple:
                if (inputs.length === 1) {
                    this.addLine(`${boxName} = ${inputs[0]}`)
                } else {
                    this.addLine(`${boxName} = (${inputs.join(", ")},)`)
                }
            } else if (box.kind === 'data') {
                // If it's a data source, record that we depend on this
                equationInputs.add(boxName)
                nodeVars[node.id] = boxName
                isTuple[node.id] = box.outputs.length !== 1
            } else {
                // Create a variable name for this node:
                if (nodeTypDups[box.type] === undefined) {
                    nodeTypDups[box.type] = 0
                } else {
                    nodeTypDups[box.type] += 1
                }
                let nodeVar = `${boxName}_${nodeTypDups[box.type]}`
                nodeVars[node.id] = nodeVar
                isTuple[node.id] = box.outputs.length !== 1

                let funcName = box.kind == 'learner' ? `learned${boxName}` : boxName

                this.addLine(`${nodeVar} = ${funcName}(${inputs.join(", ")})`)
                equationInputs.add(funcName)
            }

            // Add next nodes to the topo sort queue
            diagram.nodes
                .filter((next) => !visitedNodes.has(next.id))
                .filter((next) => diagram.edges.every((edge) => edge.target != next.id || visitedNodes.has(edge.source)))
                .forEach((next) => {
                    visitedNodes.add(next.id)
                    stack.push(next)
                })
        }

        if (outputTypes.length !== 1) {
            this.addLine(`${outVar} = (${outputTypes.map((ty) => outputVars[ty]).join(", ")})`)
        } else {
            this.addLine(`${outVar} = ${outputVars[outputTypes[0]]}`)
        }
        
        return equationInputs
    }
}

export function generatePython(wizardState, sections) {
    let generator = new CodeGenerator(sections, wizardState)
    return {
        content: generator.getPython(),
        mimeType: 'text/x-python',
        filename: 'generated.py'
    }
}

export function generateNotebook(wizardState, sections) {
    let generator = new CodeGenerator(sections, wizardState)
    return {
        content: generator.getNotebook(),
        mimeType: 'application/x-ipynb+json',
        filename: 'generated.ipynb'
    }
}

export default { generatePython, generateNotebook }
