# Fix Webview CSP Button Events

## Problem

The nonce-based CSP correctly blocks inline JavaScript event attributes such as `onclick`. Sessions, Chat, and Composer buttons therefore render but do not react.

## Goal

Move all webview button handling into nonce-authorized scripts using `addEventListener`, while retaining the strict nonce CSP and escaped model content.
