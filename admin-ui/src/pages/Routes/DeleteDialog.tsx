import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Typography,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface DeleteDialogProps {
  open: boolean;
  routePath: string;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({ open, routePath, onClose, onConfirm }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <WarningIcon />
        Delete Route
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete this route?
        </DialogContentText>
        <Typography
          variant="body1"
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'grey.100',
            borderRadius: 1,
            fontFamily: 'monospace',
          }}
        >
          {routePath}
        </Typography>
        <DialogContentText sx={{ mt: 2 }}>
          This action cannot be undone. All traffic for this route will stop being proxied.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteDialog;
