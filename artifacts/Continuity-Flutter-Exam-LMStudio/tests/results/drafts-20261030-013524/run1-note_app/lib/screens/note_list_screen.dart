import 'package:note_app/models/note.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class NoteListScreen extends StatefulWidget {
  const NoteListScreen({super.key});

  @override
  State<NoteListScreen> createState() => _NoteListScreenState();
}

class _NoteListScreenState extends State<NoteListScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _priorityController = TextEditingController();
  bool _isAdding = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Danh sách ghi chú'),
      ),
      body: ListView.builder(
        itemCount: widget.notes.length,
        itemBuilder: (context, index) {
          final note = widget.notes[index];
          return ListTile(
            leading: Icon(Icons.check_circle),
            title: Text(note.title),
            subtitle: Text('${note.done ? "Đã làm" : "Chưa làm"}'),
            trailing: IconButton(
              icon: const Icon(Icons.delete_outline),
              onPressed: () => _deleteNote(context, index),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (_isAdding) return;
          setState(() {
            _isAdding = true;
          });

          final title = _titleController.text.trim();
          final priority = int.tryParse(_priorityController.text);

          if (title.isEmpty || !Form.validateKey.currentState!.validate(title)) {
            return;
          }

          if (priority < 0) {
            return;
          }

          widget.notes.add(Note(
            title: title,
            done: false,
            priority: priority,
          ));

          _titleController.clear();
          _priorityController.clear();
          setState(() {
            _isAdding = false;
          });
        },
      ),
    );
  }

  void _deleteNote(BuildContext context, int index) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa ghi chú'),
        content: Text(widget.notes[index].title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Hủy'),
          ),
          TextButton(
            onPressed: () {
              widget.notes.removeAt(index);
              Navigator.pop(context);
            },
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _priorityController.dispose();
    super.dispose();
  }
}