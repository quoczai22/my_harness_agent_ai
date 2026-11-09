# LM Studio Desktop versus Bionic: acceptance comparison

Run both products with the **same local model files** and an 8 GB RAM Windows PC, with networking disabled during each trial. This prevents model quality from being mistaken for an app difference. Record application version, runtime version, model identifier, GGUF/projector hashes, context length, CPU/GPU, and peak memory before comparing results.

| Task | Harness + LM Studio | Bionic local mode | Evidence to record |
| --- | --- | --- | --- |
| Continue a coding task without routine prompts | Local model read `src/workspaceRegistry.ts` and answered without a prompt | Pending Bionic trial | Number of steps, unnecessary questions, useful tool reads |
| Follow `CODE_STYLE.md` | Pending real-model test | Pending Bionic trial | Diff against style examples and ease of editing rules |
| Read PDF text and use it to write code | Bundled extractor read a sample PDF; model produced a C# model using OrderId 42 | Pending Bionic trial | Correct facts, code compiled, page coverage |
| Read a PNG screenshot | Model correctly described a blue cross inside a blue circle | Pending Bionic vision test | Factual visual details, false claims |
| Resume after restart and on another PC | Pending portable-kit test | Pending Bionic export trial | Session availability and setup steps |
| Operate without Internet | Pending disconnected test | Pending disconnected test | No network dependency for inference and tools |
| Fit 8 GB RAM and 3 GB model budget | 1,980,391,008 model bytes; LM Studio estimated 2.12 GiB at 4,096 context tokens on CPU; 8 GB test pending | Pending measurement | Peak working set, model bytes, response time |
| Integrate with Harness permissions | Harness gateway requires review | Pending Bionic integration assessment | What can read, write, or execute without approval |

Do not declare a winner from documentation alone. Bionic provides a built-in agent workflow; LM Studio Desktop provides a local API server that lets Harness own the workflow. Compare task success and memory first, then setup and control. Bionic implementation should be a separate reviewed change after this LM Studio checkpoint.
