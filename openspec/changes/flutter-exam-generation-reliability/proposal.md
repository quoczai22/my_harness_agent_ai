# Proposal: Improve Flutter exam code generation reliability

Reduce observed Flutter exam failures in three areas: screens that use `TextField` without the required `Form`/`TextFormField`/`validator`, generated Dart that refers to names absent from the current class or model, and truncated model output being treated as complete code. The latest live run fell to 5/10 compilable AI files and 0/4 clean projects, versus 9/10 and 3/4 in the previous run with the same code; repeated measurements are needed before attributing an improvement. The confirmed exam text remains the only authority. Do not touch other kits.

