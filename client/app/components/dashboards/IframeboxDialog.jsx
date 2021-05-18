import React from 'react';
import PropTypes from 'prop-types';
import Modal from 'antd/lib/modal';
import Input from 'antd/lib/input';
import Divider from 'antd/lib/divider';
import { wrap as wrapDialog, DialogPropType } from '@/components/DialogWrapper';
import notification from '@/services/notification';

import './IframeboxDialog.less';

class IframeboxDialog extends React.Component {
  static propTypes = {
    dashboard: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
    dialog: DialogPropType.isRequired,
    onConfirm: PropTypes.func.isRequired,
    text: PropTypes.string,
  };

  static defaultProps = {
    text: '',
  };

  constructor(props) {
    super(props);
    const { text } = props;
    this.state = {
      saveInProgress: false,
      text,
    };
  }

  onTextChanged = (event) => {
    this.setState({ text: event.target.value });
  };

  saveWidget() {
    this.setState({ saveInProgress: true });

    this.props.onConfirm(this.state.text)
      .then(() => {
        this.props.dialog.close();
      })
      .catch(() => {
        notification.error('Widget could not be added');
      })
      .finally(() => {
        this.setState({ saveInProgress: false });
      });
  }

  render() {
    const { dialog } = this.props;
    const isNew = !this.props.text;

    return (
      <Modal
        {...dialog.props}
        title={isNew ? 'Add Iframe' : 'Edit Iframe'}
        onOk={() => this.saveWidget()}
        okButtonProps={{
          loading: this.state.saveInProgress,
          disabled: !this.state.text,
        }}
        okText={isNew ? 'Add to Dashboard' : 'Save'}
        width={500}
        wrapProps={{ 'data-test': 'IframeboxDialog' }}
      >
        <div className="iframebox-dialog">
          <Input.TextArea
            className="resize-vertical"
            rows="5"
            value={this.state.text}
            onChange={this.onTextChanged}
            autoFocus
            placeholder="This is where you write some HTML"
          />
          {this.state.text && (
            <React.Fragment>
              <Divider dashed />
              <strong className="preview-title">Preview:</strong>
              <div
                dangerouslySetInnerHTML={{ __html: this.state.text }} // eslint-disable-line react/no-danger
              />
            </React.Fragment>
          )}
        </div>
      </Modal>
    );
  }
}

export default wrapDialog(IframeboxDialog);
