import 'package:flutter/material.dart';

class AddProductScreen extends StatelessWidget {
  const AddProductScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final formKey = GlobalKey<FormState>();
    return Scaffold(
      body: Form(
        key: formKey,
        child: TextFormField(
          validator: (v) => (v == null || v.isEmpty) ? 'Tên không được để trống' : null,
        ),
      ),
    );
  }
}
