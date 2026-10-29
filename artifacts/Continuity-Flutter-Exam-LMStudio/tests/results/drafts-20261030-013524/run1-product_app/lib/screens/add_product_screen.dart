import 'package:flutter/material.dart';
import 'package:product_app/models/product.dart';
import 'package:product_app/screens/add_product_screen.dart'; // Import nội bộ dùng package:product_app/...

class AddProductScreen extends StatelessWidget {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _priceController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Thêm sản phẩm')),
      body: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: InputDecoration(labelText: 'Tên sản phẩm'),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Tên không được để trống';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _priceController,
                decoration: InputDecoration(labelText: 'Giá tiền'),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Giá không được để trống';
                  }
                  try {
                    final num = double.tryParse(value);
                    if (num <= 0) {
                      return 'Giá phải là số lớn hơn 0';
                    }
                  } catch (_) {
                    return 'Định dạng giá không hợp lệ';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _saveProduct() {
    if (_formKey.currentState!.validate()) {
      final name = _nameController.text.trim();
      final price = double.tryParse(_priceController.text);

      if (name.isEmpty || price <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Vui lòng nhập đầy đủ thông tin')),
        );
        return;
      }

      // Tạo Product từ dữ liệu đã nhập
      final product = Product(
        id: DateTime.now().millisecondsSinceEpoch,
        name: name,
        price: price,
        inStock: true,
        tags: [],
        category: null,
      );

      Navigator.pushNamed(context, '/product_detail', arguments: product);
    }
  }
}